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
import { handleMessage } from './handlers/message-handler-v2.js'

dotenv.config()

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

  return sock
}

async function handleIncomingMessage(sock: WASocket, message: WAMessage) {
  try {
    const from = message.key.remoteJid
    if (!from) return

    const isGroup = from.endsWith('@g.us')
    
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

    // Get sender number (normalize by stripping non-digits)
    const rawSender = isGroup && message.key.participant
      ? message.key.participant.split('@')[0]
      : from.split('@')[0]
    
    // Normalize phone number - keep only digits
    const sender = rawSender.replace(/\D/g, '')

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
      message: messageText,
      hasImage,
      imageBuffer,
      quotedMessage
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

http.createServer(async (req: any, res: any) => {
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
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
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

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not Found')
}).listen(PORT, '0.0.0.0', () => {
  console.log(`🏥 HTTP server running on port ${PORT}`)
  console.log(`   Health check: http://0.0.0.0:${PORT}/health`)
  
  // Start the WhatsApp bot AFTER the health check server is ready
  connectToWhatsApp().catch(error => {
    console.error('⚠️ Error starting WhatsApp bot:', error)
    console.error('   Health check server is still running')
    // Don't exit - keep the server running for health checks
  })
})

