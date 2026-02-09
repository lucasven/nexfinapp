import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WAMessage,
  WASocket,
  proto,
  downloadMediaMessage,
  Browsers
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcodeTerminal from 'qrcode-terminal'
import QRCode from 'qrcode'
import pino from 'pino'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import http from 'http'
import { handleMessage } from './handlers/core/message-handler.js'
import { authorizeGroup } from './services/groups/group-manager.js'
import { checkAuthorization, checkAuthorizationWithIdentifiers, checkAuthorizationFromJid } from './middleware/authorization.js'
import { processOnboardingMessages } from './services/onboarding/greeting-sender.js'
import { initializePostHog, shutdownPostHog } from './analytics/index.js'
import { extractUserIdentifiers, formatIdentifiersForLog } from './utils/user-identifiers.js'
import { startScheduler, stopScheduler } from './scheduler.js'
import { initTelegram, handleTelegramWebhook, shutdownTelegram } from './telegram-integration.js'

dotenv.config()

// Initialize PostHog analytics
initializePostHog()

const logger = pino({ level: 'silent' }) // Silent by default, only show our custom logs
const authStatePath = process.env.AUTH_STATE_PATH || './auth-state'

// Ensure auth state directory exists
if (!fs.existsSync(authStatePath)) {
  fs.mkdirSync(authStatePath, { recursive: true })
}

// Store socket instance to prevent multiple connections
let sock: WASocket | null = null

// Store current QR code for web endpoint
let currentQR: string | null = null

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(authStatePath)

  sock = makeWASocket({
    auth: state,
    logger,
    // getMessage is required for message retries
    getMessage: async (key) => {
      return {
        conversation: 'Mensagem não disponível'
      }
    },
    // Use appropriate browser - matches official examples
    browser: Browsers.macOS('Desktop'),
    // Don't print QR in terminal - we handle it manually
    printQRInTerminal: false,
    version: [2, 3000, 1028401180] as [number, number, number],
  })

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      // Store QR code for web endpoint
      currentQR = qr
      
      console.log('\n📱 ═══════════════════════════════════════════════')
      console.log('   QR CODE DISPONÍVEL PARA AUTENTICAÇÃO')
      console.log('═══════════════════════════════════════════════\n')
      console.log(`   🌐 Acesse: http://localhost:${PORT}/qr`)
      console.log(`   🌐 Ou no Railway: https://seu-app.railway.app/qr\n`)
      
      // Also print to terminal for local development
      qrcodeTerminal.generate(qr, { small: true })
      
      console.log('\n📱 Passos para conectar:')
      console.log('   1. Acesse o link /qr no navegador')
      console.log('   2. Abra WhatsApp no seu celular')
      console.log('   3. Toque em Mais opções (⋮) > Aparelhos conectados')
      console.log('   4. Toque em Conectar um aparelho')
      console.log('   5. Escaneie o QR code da página web\n')
    }

    if (connection === 'open') {
      // Clear QR code when connected
      currentQR = null
    }

    if (connection === 'close') {
      // According to Baileys docs, check the error properly
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      
      console.log('\n❌ Conexão fechada devido a:', lastDisconnect?.error)
      console.log('   Status Code:', statusCode)
      console.log('   Deve reconectar?', shouldReconnect)
      
      // Only reconnect if not logged out
      if (shouldReconnect) {
        console.log('   ⏳ Reconectando...')
        setTimeout(() => {
          connectToWhatsApp()
        }, 3000)
      } else {
        console.log('\n🛑 Desconectado. Não reconectando.')
        console.log('   Para reconectar, delete auth-state e reinicie:')
        console.log('   rm -rf whatsapp-bot/auth-state && npm run dev\n')
      }
    } else if (connection === 'open') {
      console.log('\n✅ ═══════════════════════════════════════════════')
      console.log('   CONECTADO AO WHATSAPP!')
      console.log('   ═══════════════════════════════════════════════')
      console.log('   🤖 Bot pronto para receber mensagens!')
      console.log('   📱 Envie "ajuda" para testar\n')

      // Start polling for onboarding messages every 30 seconds
      setInterval(async () => {
        processOnboardingMessages(sock)
      }, 30000) // 30 seconds

      // Process immediately on connection
      processOnboardingMessages(sock)
      console.log('   📬 Serviço de mensagens de onboarding iniciado\n')
    }
  })

  // Save credentials whenever they update
  sock.ev.on('creds.update', saveCreds)

  // Listen for new messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // Only process new messages (not from history)
    if (type !== 'notify') return

    for (const message of messages) {
      // Ignore messages from myself (IMPORTANT: prevents infinite loops!)
      //if (message.key.fromMe) continue
      
      // Ignore messages without content
      if (!message.message) continue

      await handleIncomingMessage(sock!, message)
    }
  })

  // Listen for group participant updates (when bot is added/removed from groups)
  sock.ev.on('group-participants.update', async (update) => {
    try {
      if (!sock) return // Safety check
      
      const { id: groupJid, participants, action } = update
      
      console.log('[group-participants.update] Event:', { groupJid, action, participants: participants.length })
      
      // Check if bot was added to a group
      if (action === 'add') {
        // Get bot's JID
        const botJid = sock.user?.id
        if (!botJid) return
        
        // Check if the bot is one of the added participants
        const botWasAdded = participants.some(p => {
          const participantNumber = p.split('@')[0].split(':')[0]
          const botNumber = botJid.split(':')[0]
          return participantNumber === botNumber
        })
        
        if (botWasAdded) {
          console.log('[group-participants.update] Bot was added to group:', groupJid)
          
          try {
            // Get group metadata
            const groupMetadata = await sock.groupMetadata(groupJid)
            const groupName = groupMetadata.subject
            
            // Get the person who added the bot (author of the action)
            const adderJid = update.author
            if (!adderJid) {
              console.log('[group-participants.update] No author found for add action')
              return
            }
            
            console.log('[group-participants.update] Bot added by JID:', adderJid)

            // Check if the person who added the bot is authorized
            // Use checkAuthorizationFromJid to properly handle LIDs (Business accounts)
            const authResult = await checkAuthorizationFromJid(adderJid)

            // Extract identifier for group authorization (phone if available, otherwise JID)
            const [localPart, domain] = adderJid.split('@')
            const adderIdentifier = domain === 's.whatsapp.net'
              ? localPart.split(':')[0]  // Phone number
              : adderJid  // Use full JID for LID accounts

            if (authResult.authorized && authResult.userId) {
              console.log('[group-participants.update] Adder is authorized, auto-authorizing group')

              // Auto-authorize the group
              const result = await authorizeGroup(
                groupJid,
                groupName,
                authResult.userId,
                adderIdentifier,
                true // auto_authorized = true
              )
              
              if (result.success) {
                // Send welcome message to the group
                await sock.sendMessage(groupJid, {
                  text: `✅ Grupo autorizado automaticamente!\n\n` +
                        `Olá! Fui adicionado por um usuário autorizado.\n` +
                        `Todos no grupo podem usar minhas funcionalidades.\n\n` +
                        `Envie "ajuda" para ver o que posso fazer! 🤖`
                })
                console.log('[group-participants.update] Group auto-authorized successfully')
              } else {
                console.error('[group-participants.update] Failed to authorize group:', result.error)
              }
            } else {
              console.log('[group-participants.update] Adder is not authorized, group not auto-authorized')
              
              // Send message explaining authorization is needed
              await sock.sendMessage(groupJid, {
                text: `⚠️ Olá! Fui adicionado a este grupo, mas ainda não estou autorizado.\n\n` +
                      `Para me usar aqui, a pessoa que me adicionou precisa:\n` +
                      `1. Me enviar uma mensagem direta primeiro\n` +
                      `2. Fazer login com: login: email senha\n` +
                      `3. Então eu poderei funcionar neste grupo automaticamente.`
              })
            }
          } catch (error) {
            console.error('[group-participants.update] Error processing group add:', error)
          }
        }
      }
    } catch (error) {
      console.error('[group-participants.update] Error in event handler:', error)
    }
  })

  return sock
}

async function handleGroupInvite(
  sock: WASocket,
  from: string,
  inviteCode: string,
  groupJid?: string | null,
  groupName?: string | null
): Promise<void> {
  try {
    console.log('[GROUP INVITE] Processing invite:', {
      inviteCode,
      groupJid,
      groupName,
      from
    })

    // Check if sender is authorized using multi-identifier lookup
    // This properly handles LIDs (Business accounts) that don't expose phone numbers
    const authResult = await checkAuthorizationFromJid(from)

    // Extract identifier for group authorization (phone if available, otherwise JID)
    const [localPart, domain] = from.split('@')
    const senderIdentifier = domain === 's.whatsapp.net'
      ? localPart.split(':')[0]  // Phone number
      : from  // Use full JID for LID accounts
    
    if (authResult.authorized && authResult.userId) {
      console.log('[GROUP INVITE] Sender is authorized, accepting invite')
      
      try {
        // Accept the group invite
        const joinResult = await sock.groupAcceptInvite(inviteCode)
        console.log('[GROUP INVITE] Joined group:', joinResult)
        
        // Get group JID (prefer from invite message, fallback to join result)
        const groupJidFinal = groupJid || joinResult
        if (!groupJidFinal) {
          throw new Error('Could not determine group JID')
        }
        
        // Fetch group metadata to get the name if not provided
        let finalGroupName = groupName
        if (!finalGroupName) {
          try {
            const metadata = await sock.groupMetadata(groupJidFinal)
            finalGroupName = metadata.subject
          } catch (error) {
            console.error('[GROUP INVITE] Error fetching group metadata:', error)
            finalGroupName = 'Unknown Group'
          }
        }
        
        // Auto-authorize the group
        const result = await authorizeGroup(
          groupJidFinal,
          finalGroupName || 'Unknown Group',
          authResult.userId,
          senderIdentifier,
          true // auto_authorized = true
        )
        
        if (result.success) {
          // Send confirmation to user
          await sock.sendMessage(from, {
            text: `✅ Entrei no grupo "${finalGroupName}" e autorizei automaticamente!\n\n` +
                  `O grupo agora está ativo e todos podem usar minhas funcionalidades.\n\n` +
                  `Você pode gerenciar grupos autorizados no app web em Profile Settings.`
          })
          
          // Send welcome message to the group
          try {
            await sock.sendMessage(groupJidFinal, {
              text: `👋 Olá! Fui convidado e estou pronto para ajudar!\n\n` +
                    `Todos no grupo podem usar minhas funcionalidades.\n` +
                    `Envie "ajuda" para ver o que posso fazer! 🤖`
            })
          } catch (error) {
            console.error('[GROUP INVITE] Error sending welcome message:', error)
          }
          
          console.log('[GROUP INVITE] Group auto-authorized successfully')
        } else {
          await sock.sendMessage(from, {
            text: `⚠️ Entrei no grupo mas houve um erro ao autorizar: ${result.error}`
          })
        }
      } catch (error) {
        console.error('[GROUP INVITE] Error accepting invite:', error)
        await sock.sendMessage(from, {
          text: `❌ Erro ao aceitar o convite do grupo.\n\n` +
                `Possíveis causas:\n` +
                `• Link expirado ou inválido\n` +
                `• Grupo cheio\n` +
                `• Você não tem permissão para adicionar membros\n\n` +
                `Tente gerar um novo link de convite.`
        })
      }
    } else {
      console.log('[GROUP INVITE] Sender not authorized')
      await sock.sendMessage(from, {
        text: `⚠️ Você precisa estar autenticado primeiro!\n\n` +
              `Envie: login: seuemail@email.com suasenha\n\n` +
              `Depois disso, envie o convite novamente e eu entrarei automaticamente.`
      })
    }
  } catch (error) {
    console.error('[GROUP INVITE] Error processing invite:', error)
    await sock.sendMessage(from, {
      text: `❌ Erro ao processar convite do grupo. Tente novamente.`
    })
  }
}

async function handleIncomingMessage(sock: WASocket, message: WAMessage) {
  try {
    const from = message.key.remoteJid
    if (!from) return

    const isGroup = from.endsWith('@g.us')
    
    // Get group metadata if this is a group message
    let groupName: string | null = null
    let groupJid: string | null = null
    
    if (isGroup) {
      groupJid = from
      try {
        const groupMetadata = await sock.groupMetadata(from)
        groupName = groupMetadata.subject
        //console.log('[DEBUG] Group metadata:', { groupJid, groupName })
      } catch (error) {
        console.error('Error fetching group metadata:', error)
      }
    }
    
    // Extract message text - handle different message types
    let messageText = ''
    const msg = message.message
    
    if (msg?.conversation) {
      messageText = msg.conversation
    } else if (msg?.extendedTextMessage?.text) {
      messageText = msg.extendedTextMessage.text
    } else if (msg?.imageMessage?.caption) {
      messageText = msg.imageMessage.caption || ''
    } else if (msg?.videoMessage?.caption) {
      messageText = msg.videoMessage.caption || ''
    }
    
    // Check for group invite in DMs (both as groupInviteMessage and as text URL)
    if (!isGroup) {
      // Check for groupInviteMessage object first
      if (msg?.groupInviteMessage) {
        const inviteCode = msg.groupInviteMessage.inviteCode
        const groupJidInvite = msg.groupInviteMessage.groupJid
        const groupNameInvite = msg.groupInviteMessage.groupName
        
        if (inviteCode) {
          await handleGroupInvite(sock, from, inviteCode, groupJidInvite, groupNameInvite)
          return
        }
      }
      
      // Check for WhatsApp group invite URL in text
      const groupInviteRegex = /https?:\/\/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/
      const match = messageText.match(groupInviteRegex)
      
      if (match && match[1]) {
        const inviteCode = match[1]
        console.log('[GROUP INVITE URL] Detected invite link in text:', inviteCode)
        await handleGroupInvite(sock, from, inviteCode)
        return // Don't process as regular message
      }
    }

    // Extract quoted message if present (for reply context)
    let quotedMessage: string | undefined
    if (msg?.extendedTextMessage?.contextInfo?.quotedMessage) {
      const quoted = msg.extendedTextMessage.contextInfo.quotedMessage
      if (quoted.conversation) {
        quotedMessage = quoted.conversation
      } else if (quoted.extendedTextMessage?.text) {
        quotedMessage = quoted.extendedTextMessage.text
      }
    }

    // Extract all user identifiers using new multi-identifier system
    const userIdentifiers = extractUserIdentifiers(message, isGroup)

    // Use phone number for backward compatibility (if available)
    // Otherwise, use the full JID as the identifier
    const sender = userIdentifiers.phoneNumber || userIdentifiers.jid

    // Log identifier info for debugging (sanitized)
    console.log('[User Identification]', formatIdentifiersForLog(userIdentifiers))

    // Check for image
    const hasImage = !!msg?.imageMessage
    let imageBuffer: Buffer | undefined

    if (hasImage) {
      try {
        imageBuffer = await downloadMediaMessage(
          message, 
          'buffer', 
          {}
        ) as Buffer
      } catch (error) {
        console.error('Error downloading image:', error)
      }
    }

    // Handle the message
    const response = await handleMessage({
      from: sender,
      isGroup,
      groupJid: groupJid || undefined,
      groupName: groupName || undefined,
      message: messageText,
      hasImage,
      imageBuffer,
      quotedMessage,
      userIdentifiers // Pass full identifiers for multi-identifier support
    })

    // Send response if we have one
    if (response) {
      // Check if response is an array of messages (multiple transactions)
      if (Array.isArray(response)) {
        // Send each message individually with a small delay
        for (let i = 0; i < response.length; i++) {
          await sock.sendMessage(from, { 
            text: response[i] 
          }, {
            quoted: i === 0 ? message : undefined // Only quote the first message
          })
          
          // Small delay between messages to avoid rate limiting
          if (i < response.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
      } else {
        // Single message
        await sock.sendMessage(from, { 
          text: response 
        }, {
          quoted: message // Quote the original message
        })
      }
    }
  } catch (error) {
    console.error('Error handling message:', error)
    
    // Try to send error message
    try {
      if (message.key.remoteJid) {
        await sock.sendMessage(message.key.remoteJid, { 
          text: '❌ Ocorreu um erro ao processar sua mensagem. Tente novamente.' 
        })
      }
    } catch (sendError) {
      console.error('Error sending error message:', sendError)
    }
  }
}

// HTTP server for health checks and API endpoints
// Start this FIRST so Railway health checks pass even if WhatsApp connection fails
const PORT = parseInt(process.env.PORT || '3001', 10)

const server = http.createServer(async (req: any, res: any) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      telegram: !!process.env.TELEGRAM_BOT_TOKEN ? 'enabled' : 'disabled'
    }))
    return
  }

  // QR Code endpoint
  if (req.url === '/qr') {
    if (currentQR) {
      try {
        const qrDataURL = await QRCode.toDataURL(currentQR, { width: 400 })
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp QR Code - Expense Tracker</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 40px;
      max-width: 500px;
      width: 100%;
      text-align: center;
    }
    h1 {
      color: #333;
      margin-bottom: 10px;
      font-size: 28px;
    }
    .subtitle {
      color: #666;
      margin-bottom: 30px;
      font-size: 14px;
    }
    .qr-container {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 15px;
      margin-bottom: 30px;
      display: inline-block;
    }
    img {
      border-radius: 10px;
      max-width: 100%;
      height: auto;
    }
    .instructions {
      text-align: left;
      background: #f8f9fa;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 20px;
    }
    .instructions h3 {
      color: #333;
      margin-bottom: 15px;
      font-size: 18px;
    }
    .instructions ol {
      color: #555;
      padding-left: 20px;
      line-height: 1.8;
    }
    .instructions li {
      margin-bottom: 8px;
    }
    .button {
      background: #dc3545;
      color: white;
      border: none;
      padding: 12px 30px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      width: 100%;
      margin-top: 10px;
    }
    .button:hover {
      background: #c82333;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
    }
    .button:active {
      transform: translateY(0);
    }
    .status {
      margin-top: 15px;
      padding: 10px;
      border-radius: 8px;
      font-weight: 600;
      display: none;
    }
    .status.success {
      background: #d4edda;
      color: #155724;
      display: block;
    }
    .status.error {
      background: #f8d7da;
      color: #721c24;
      display: block;
    }
    .emoji {
      font-size: 48px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="emoji">📱</div>
    <h1>WhatsApp QR Code</h1>
    <p class="subtitle">Escaneie para conectar o bot</p>
    
    <div class="qr-container">
      <img src="${qrDataURL}" alt="QR Code do WhatsApp" />
    </div>

    <div class="instructions">
      <h3>📋 Como conectar:</h3>
      <ol>
        <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
        <li>Toque em <strong>Mais opções (⋮)</strong> → <strong>Aparelhos conectados</strong></li>
        <li>Toque em <strong>Conectar um aparelho</strong></li>
        <li>Aponte a câmera para o QR Code acima</li>
        <li>Aguarde a confirmação de conexão</li>
      </ol>
    </div>

    <button class="button" onclick="clearAuth()">
      🗑️ Limpar Autenticação e Reconectar
    </button>

    <div id="status" class="status"></div>
  </div>

  <script>
    async function clearAuth() {
      if (!confirm('Tem certeza que deseja limpar a autenticação? Isso desconectará o bot e você precisará escanear um novo QR Code.')) {
        return;
      }

      const button = document.querySelector('.button');
      const status = document.getElementById('status');
      button.disabled = true;
      button.textContent = '⏳ Limpando...';

      try {
        const response = await fetch('/clear-auth', { method: 'DELETE' });
        const data = await response.json();

        if (response.ok) {
          status.className = 'status success';
          status.textContent = '✅ ' + data.message;
          button.textContent = '🔄 Recarregar página';
          button.onclick = () => location.reload();
        } else {
          throw new Error(data.error || 'Erro desconhecido');
        }
      } catch (error) {
        status.className = 'status error';
        status.textContent = '❌ Erro: ' + error.message;
        button.disabled = false;
        button.textContent = '🗑️ Limpar Autenticação e Reconectar';
      }
    }

    // Auto-refresh every 10 seconds to check for new QR
    setInterval(() => {
      if (!document.querySelector('.button').disabled) {
        location.reload();
      }
    }, 10000);
  </script>
</body>
</html>
        `)
      } catch (error) {
        console.error('Error generating QR code:', error)
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body><h1>❌ Erro ao gerar QR Code</h1></body></html>')
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Bot - Conectado</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 40px;
      max-width: 500px;
      width: 100%;
      text-align: center;
    }
    h1 { color: #28a745; margin-bottom: 20px; }
    p { color: #666; line-height: 1.6; margin-bottom: 15px; }
    .button {
      background: #dc3545;
      color: white;
      border: none;
      padding: 12px 30px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-top: 20px;
    }
    .button:hover {
      background: #c82333;
      transform: translateY(-2px);
    }
    .emoji { font-size: 64px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="emoji">✅</div>
    <h1>Bot Conectado!</h1>
    <p>O WhatsApp está conectado e funcionando.</p>
    <p>Não há QR Code disponível no momento.</p>
    <button class="button" onclick="clearAuth()">
      🗑️ Desconectar e Gerar Novo QR Code
    </button>
    <div id="status" style="margin-top: 15px; font-weight: bold;"></div>
  </div>
  <script>
    async function clearAuth() {
      if (!confirm('Desconectar o bot? Você precisará escanear um novo QR Code.')) return;
      const button = document.querySelector('.button');
      button.disabled = true;
      button.textContent = '⏳ Desconectando...';
      try {
        const response = await fetch('/clear-auth', { method: 'DELETE' });
        const data = await response.json();
        if (response.ok) {
          document.getElementById('status').style.color = '#28a745';
          document.getElementById('status').textContent = '✅ ' + data.message;
          setTimeout(() => location.reload(), 2000);
        } else {
          throw new Error(data.error || 'Erro desconhecido');
        }
      } catch (error) {
        document.getElementById('status').style.color = '#dc3545';
        document.getElementById('status').textContent = '❌ ' + error.message;
        button.disabled = false;
        button.textContent = '🗑️ Desconectar e Gerar Novo QR Code';
      }
    }
  </script>
</body>
</html>
      `)
    }
    return
  }

  // Clear auth endpoint
  if (req.url === '/clear-auth' && req.method === 'DELETE') {
    try {
      // Check if auth state directory exists
      if (fs.existsSync(authStatePath)) {
        // Remove all files in the directory
        const files = fs.readdirSync(authStatePath)
        for (const file of files) {
          fs.unlinkSync(path.join(authStatePath, file))
        }
        
        console.log('\n🗑️  Auth state cleared. Reconnecting...\n')
        
        // Close current connection if exists
        if (sock) {
          sock.end(undefined)
          sock = null
        }
        
        // Reconnect after a short delay
        setTimeout(() => {
          connectToWhatsApp().catch(error => {
            console.error('⚠️ Error reconnecting:', error)
          })
        }, 2000)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Autenticação limpa com sucesso. Reconectando...' 
        }))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ 
          success: false, 
          error: 'Pasta de autenticação não encontrada' 
        }))
      }
    } catch (error) {
      console.error('Error clearing auth state:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        success: false, 
        error: 'Erro ao limpar autenticação: ' + (error as Error).message 
      }))
    }
    return
  }

  // Telegram webhook
  if (handleTelegramWebhook(req, res)) {
    return
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not Found')
})

// Only start the HTTP server in non-test environments
// This prevents port conflicts and resource usage during test runs
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🏥 HTTP server running on port ${PORT}`)
    console.log(`   Health check: http://0.0.0.0:${PORT}/health`)

    // Start the cron scheduler
    startScheduler()

    // Start Telegram bot (if configured)
    initTelegram().catch(error => {
      console.error('⚠️ Error starting Telegram bot:', error)
      console.error('   WhatsApp bot will still start normally')
    })

    // Start the WhatsApp bot AFTER the health check server is ready
    connectToWhatsApp().catch(error => {
      console.error('⚠️ Error starting WhatsApp bot:', error)
      console.error('   Health check server is still running')
      // Don't exit - keep the server running for health checks
    })
  })
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...')
  stopScheduler()
  await shutdownTelegram()
  await shutdownPostHog()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...')
  stopScheduler()
  await shutdownTelegram()
  await shutdownPostHog()
  process.exit(0)
})

/**
 * Get the Baileys socket instance
 * Used by message queue processor (Story 5.4)
 * @returns The Baileys socket instance or null if not connected
 */
export function getSocket(): WASocket | null {
  return sock
}

