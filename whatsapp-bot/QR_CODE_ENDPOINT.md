# WhatsApp QR Code Web Endpoint

This bot provides a beautiful web interface for WhatsApp authentication, making it perfect for Railway and other cloud deployments where you can't scan QR codes from logs.

## 🌟 Features

- ✅ **Beautiful Web UI** - Modern, responsive design
- ✅ **Auto-refresh** - Page updates every 10 seconds
- ✅ **Clear Auth Button** - Disconnect and reconnect easily
- ✅ **Railway-friendly** - Works perfectly in production
- ✅ **Mobile-responsive** - Works on any device

## 📱 Endpoints

### `/qr` - QR Code Display

Access this endpoint to see and scan the WhatsApp QR code.

**When connected:**
- Shows a success message
- Displays "Bot Conectado!" status
- Provides option to disconnect

**When not connected:**
- Shows QR code as image
- Provides step-by-step instructions
- Auto-refreshes to show new QR codes

### `/clear-auth` - Clear Authentication

`DELETE /clear-auth`

Clears the authentication state and forces reconnection.

**Response:**
```json
{
  "success": true,
  "message": "Autenticação limpa com sucesso. Reconectando..."
}
```

## 🚀 Usage

### Local Development

1. Start the bot:
```bash
npm run dev
```

2. Open in browser:
```
http://localhost:3001/qr
```

3. Scan the QR code with WhatsApp

### Railway Deployment

1. Deploy your bot to Railway

2. Get your app URL from Railway dashboard

3. Open in browser:
```
https://your-app.railway.app/qr
```

4. Scan the QR code with WhatsApp

## 📋 How to Connect

1. **Open the `/qr` endpoint** in your browser
2. **Open WhatsApp** on your phone
3. Go to **Menu (⋮)** → **Linked Devices**
4. Tap **Link a Device**
5. **Scan the QR code** from the webpage
6. ✅ **Done!** The page will show "Bot Conectado!"

## 🗑️ How to Reconnect

If you need to reconnect (e.g., session expired, testing, or switching devices):

1. Open `/qr` endpoint
2. Click **"Limpar Autenticação e Reconectar"** button
3. Confirm the action
4. Wait 2-3 seconds for reconnection
5. Page will refresh and show new QR code
6. Scan with WhatsApp

## 🎨 UI Features

### QR Code Page
- Gradient purple background
- Centered white card with shadow
- Large, scannable QR code (400x400px)
- Step-by-step instructions in Portuguese
- Red button to clear authentication
- Auto-refresh every 10 seconds

### Connected Page
- Green checkmark emoji
- Success message
- Option to disconnect
- Clean, modern design

## 🔒 Security Notes

- The `/qr` endpoint is public (no authentication required)
- The `/clear-auth` endpoint requires confirmation in the UI
- Auth state is stored in Railway volume at `/app/auth-state`
- QR codes expire after a few minutes (WhatsApp security)

## 💡 Tips

1. **Bookmark the `/qr` URL** for easy access
2. **Page auto-refreshes** - no need to manually reload
3. **Works on mobile** - you can open on a tablet and scan from your phone
4. **Clear auth if stuck** - use the button if connection issues occur
5. **Check Railway logs** - logs will show connection status

## 🐛 Troubleshooting

### QR Code Not Showing

**Problem:** Page shows "Bot Conectado!" but you want to reconnect

**Solution:** Click the "Desconectar e Gerar Novo QR Code" button

---

**Problem:** Blank page or error

**Solution:** 
- Check if bot is running (`/health` endpoint)
- Check Railway logs for errors
- Restart the Railway service

### Can't Scan QR Code

**Problem:** QR code image is too small

**Solution:** The QR code is 400x400px. You can zoom in your browser (Ctrl/Cmd + +)

---

**Problem:** WhatsApp says "Invalid QR code"

**Solution:** 
- Wait a few seconds and let the page auto-refresh
- QR codes expire, a new one will be generated
- Try clicking "Limpar Autenticação" and scanning the new code

### Connection Drops

**Problem:** Bot disconnects frequently

**Solution:**
- Make sure Railway volume is properly configured at `/app/auth-state`
- Check environment variable `AUTH_STATE_PATH=/app/auth-state`
- The volume persists authentication between deployments

## 🔧 Technical Details

### Implementation

The bot uses:
- `@whiskeysockets/baileys` for WhatsApp connection
- `qrcode` package to generate data URLs
- `qrcode-terminal` for terminal display (local dev)
- In-memory storage for current QR code
- HTTP server with multiple endpoints

### Code Flow

1. Bot starts and tries to connect to WhatsApp
2. If not authenticated, generates QR code
3. QR code is stored in `currentQR` variable
4. `/qr` endpoint reads `currentQR` and generates image
5. When scanned, connection opens and `currentQR` is cleared
6. `/clear-auth` deletes auth files and triggers reconnection

### Files Managed

The authentication state consists of:
- `creds.json` - WhatsApp credentials
- `app-state-sync-*.json` - App state
- Other session files

All stored in the volume at `/app/auth-state` (or `./auth-state` locally)

## 📚 Related Documentation

- [README.md](./README.md) - Main project documentation
- [Railway Deployment Guide](./DEPLOY.md) - Deployment instructions
- [Baileys Documentation](https://github.com/WhiskeySockets/Baileys) - WhatsApp library

## 🎉 Enjoy!

You now have a production-ready WhatsApp authentication system that works perfectly in cloud environments!

