# WhatsApp Profile & Group Integration

## Overview

This feature adds a profile page to the webapp where users can:
- Manage their profile information
- Add multiple WhatsApp numbers with granular permissions
- Generate WhatsApp group invites for bot communication

## Architecture

### Services

1. **Webapp (fe/)** - Next.js application that provides the UI
2. **WhatsApp Bot (whatsapp-bot/)** - Standalone service that handles WhatsApp communication
3. **Shared Database** - Both services connect to the same Supabase database

### Communication Flow

```
User clicks "Generate Group Invite" 
  → Webapp API (/api/whatsapp/group-invite)
  → HTTP request to Bot API (http://localhost:3001/api/generate-invite)
  → Bot creates WhatsApp group and generates invite link
  → Bot returns invite link to Webapp
  → Webapp displays invite link to user
```

## Setup Instructions

### 1. Database Migration

Run the migration script to create the required tables:

```sql
-- Execute: fe/scripts/005_user_profiles_and_permissions.sql
```

This creates:
- `user_profiles` - User profile data
- `authorized_whatsapp_numbers` - Multiple WhatsApp numbers with permissions
- `whatsapp_group_invites` - Group invite tracking

### 2. Environment Variables

**Webapp (fe/.env.local)**:
```bash
WHATSAPP_BOT_API_URL=http://localhost:3001/api/generate-invite
```

**Bot (whatsapp-bot/.env)**:
```bash
PORT=3001
```

### 3. Start Services

**Terminal 1 - Start Webapp**:
```bash
cd fe
npm run dev
```

**Terminal 2 - Start WhatsApp Bot**:
```bash
cd whatsapp-bot
npm run dev
```

## Features

### Profile Management

Navigate to `/profile` in the webapp to access:

1. **Profile Settings**
   - Display name
   - Email (read-only)

2. **WhatsApp Configuration**
   - Add multiple WhatsApp numbers
   - Set one number as primary
   - Configure permissions per number

### Permissions System

Each WhatsApp number can have the following permissions:

- **View** - View transactions and balances
- **Add** - Add new transactions
- **Edit** - Modify existing transactions
- **Delete** - Delete transactions
- **Manage Budgets** - Create/edit/delete budgets
- **View Reports** - Access financial reports

### Group Invite Generation

1. Add your primary WhatsApp number in the profile page
2. Click "Generate Group Invite"
3. The bot will create a WhatsApp group and return an invite link
4. Share the invite link or scan the QR code to join the group
5. Use the group to communicate with the bot

## How It Works

### Bot API Endpoint

The bot exposes an HTTP endpoint at `/api/generate-invite`:

```typescript
POST http://localhost:3001/api/generate-invite
Content-Type: application/json

{
  "userId": "user-uuid",
  "whatsappNumber": "5511999999999"
}

Response:
{
  "groupJid": "120363...",
  "inviteCode": "ABC123...",
  "inviteLink": "https://chat.whatsapp.com/ABC123..."
}
```

### Fallback Mechanism

If the bot is not running or unavailable:

1. The webapp creates a pending request in the database
2. The bot polls the database every 60 seconds
3. When the bot comes online, it processes pending requests
4. Users can return to the profile page to get their invite link

### Authorization in Bot

The bot checks authorization before executing any command:

```typescript
// Check if WhatsApp number is authorized
const auth = await checkAuthorization(whatsappNumber)

// Validate permission for specific action
if (!hasPermission(auth.permissions, 'add')) {
  return 'Unauthorized'
}
```

## Testing

### 1. Add Your WhatsApp Number

1. Go to `/profile`
2. Click "Add Number"
3. Enter your WhatsApp number (e.g., 5511999999999)
4. Set a name (e.g., "Me")
5. Check "Set as primary number"
6. Select desired permissions
7. Click "Add"

### 2. Generate Group Invite

1. Click "Generate Group Invite"
2. Wait for the invite link to be generated
3. Copy the invite link or scan the QR code
4. Join the WhatsApp group
5. Send messages to the bot in the group

### 3. Add Family Members

1. Click "Add Number" again
2. Enter family member's WhatsApp number
3. Set a name (e.g., "Spouse")
4. Configure permissions
5. Save

Now both numbers can interact with the bot according to their permissions!

## Troubleshooting

### "Bot service not available"

- Make sure the WhatsApp bot is running (`cd whatsapp-bot && npm run dev`)
- Check that the bot is on port 3001
- Verify `WHATSAPP_BOT_API_URL` in webapp `.env.local`

### "No primary WhatsApp number found"

- Add at least one WhatsApp number
- Set it as primary by checking "Set as primary number"

### Bot not responding to commands

- Check if the WhatsApp number is added in the profile
- Verify permissions are enabled
- Check bot logs for authorization errors

### Group invite not working

- Ensure the bot is authenticated with WhatsApp (scan QR code)
- Check bot logs for group creation errors
- Verify the WhatsApp number format (include country code)

## Files Changed/Created

### Webapp (fe/)
- `scripts/005_user_profiles_and_permissions.sql` - Database migration
- `lib/types.ts` - New type definitions
- `lib/actions/profile.ts` - Server actions for profile management
- `app/profile/page.tsx` - Profile page
- `app/api/whatsapp/group-invite/route.ts` - API endpoint
- `components/profile-settings-card.tsx`
- `components/whatsapp-numbers-card.tsx`
- `components/whatsapp-number-dialog.tsx`
- `components/group-invite-dialog.tsx`
- `components/ui/badge.tsx`
- `components/user-menu.tsx` - Added profile link

### WhatsApp Bot (whatsapp-bot/)
- `src/services/group-manager.ts` - Group creation and invite generation
- `src/middleware/authorization.ts` - Permission checking
- `src/index.ts` - Added HTTP API endpoint and periodic polling

## Security Notes

- All database operations use Row Level Security (RLS)
- WhatsApp numbers are validated before storage
- Only one primary number allowed per user
- Bot validates permissions before executing commands
- API endpoints require authentication
- CORS enabled for local development only

