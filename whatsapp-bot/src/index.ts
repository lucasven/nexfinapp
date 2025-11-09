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
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { handleMessage } from './handlers/message-handler-v2'

dotenv.config()

const logger = pino({ level: 'silent' }) // Silent by default, only show our custom logs
const authStatePath = process.env.AUTH_STATE_PATH || './auth-state'

// Ensure auth state directory exists
if (!fs.existsSync(authStatePath)) {
  fs.mkdirSync(authStatePath, { recursive: true })
}

// Store socket instance to prevent multiple connections
let sock: WASocket | null = null

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
      console.log('\n📱 ═══════════════════════════════════════════════')
      console.log('   ESCANEIE O QR CODE COM SEU WHATSAPP')
      console.log('═══════════════════════════════════════════════\n')
      qrcode.generate(qr, { small: true })
      console.log('\n📱 Passos para conectar:')
      console.log('   1. Abra WhatsApp no seu celular')
      console.log('   2. Toque em Mais opções (⋮) > Aparelhos conectados')
      console.log('   3. Toque em Conectar um aparelho')
      console.log('   4. Aponte seu telefone para esta tela\n')
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
const http = require('http')
const PORT = process.env.PORT || 3001

http.createServer(async (req: any, res: any) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
  } else {
    res.writeHead(404)
    res.end()
  }
}).listen(PORT, () => {
  console.log(`🏥 HTTP server running on port ${PORT}`)
  console.log(`   Health check: http://localhost:${PORT}/health`)
  
  // Start the WhatsApp bot AFTER the health check server is ready
  connectToWhatsApp().catch(error => {
    console.error('⚠️ Error starting WhatsApp bot:', error)
    console.error('   Health check server is still running')
    // Don't exit - keep the server running for health checks
  })
})

