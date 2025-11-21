# Multi-Identifier User Recognition Implementation

## Problem Statement

WhatsApp Business accounts can use **anonymous Local Identifiers (LIDs)** instead of exposing actual phone numbers in their JID (Jabber ID). The previous system only extracted phone numbers from JIDs, causing identification failures for some Business accounts.

### Example JID Formats

**Regular WhatsApp:**
```
5511999999999@s.whatsapp.net
```

**WhatsApp Business (with LID suffix):**
```
5511999999999:10@s.whatsapp.net
```

**Anonymous Business Account:**
```
lid_abc123xyz:45@lid  (no phone number exposed)
```

## Solution Overview

Implement a **multi-identifier system** that stores and lookups users by:
1. **JID** (Jabber ID) - Always available, most reliable
2. **LID** (Local Identifier) - For Business/anonymous accounts
3. **Phone Number** - Extracted when available, for backward compatibility

### Cascading Lookup Strategy

When a message arrives, the system tries to find the user in this order:
1. Try **JID** (exact match) - Most reliable
2. Try **LID** (for Business accounts) - Fallback for anonymous accounts
3. Try **Phone Number** (legacy) - Backward compatibility
4. Try **Legacy Sessions** - Backward compatibility

## Implementation Details

### 1. Database Schema Changes

**Migration:** `fe/scripts/028_multi_identifier_support.sql`

**New Columns in `authorized_whatsapp_numbers`:**
```sql
ALTER TABLE authorized_whatsapp_numbers ADD COLUMN:
- whatsapp_jid TEXT           -- Full JID (e.g., "5511999999999@s.whatsapp.net")
- whatsapp_lid TEXT           -- Local Identifier for Business accounts
- account_type TEXT           -- 'regular', 'business', or 'unknown'
- push_name TEXT              -- Display name from WhatsApp
```

**New Database Functions:**

```sql
-- Cascading user lookup (JID → LID → Phone)
find_user_by_whatsapp_identifier(p_jid, p_lid, p_phone_number)

-- Upsert identifiers (update or insert)
upsert_whatsapp_identifiers(p_user_id, p_whatsapp_number, p_whatsapp_jid, ...)
```

**Indexes for Performance:**
```sql
CREATE INDEX idx_authorized_whatsapp_jid ON authorized_whatsapp_numbers(whatsapp_jid);
CREATE INDEX idx_authorized_whatsapp_lid ON authorized_whatsapp_numbers(whatsapp_lid);
CREATE INDEX idx_authorized_whatsapp_identifiers ON authorized_whatsapp_numbers(
  whatsapp_number, whatsapp_jid, whatsapp_lid
);
```

### 2. User Identifier Extraction

**File:** `whatsapp-bot/src/utils/user-identifiers.ts`

**Key Functions:**

```typescript
// Extract all available identifiers from a Baileys message
extractUserIdentifiers(message: WebMessageInfo, isGroup: boolean): UserIdentifiers

// Extract phone number from JID (handles LID suffix)
extractPhoneNumberFromJid(jid: string): string | null

// Check if two JIDs represent the same user
isSameUser(jid1: string, jid2: string): boolean

// Format identifiers for logging (sanitized - only last 4 digits)
formatIdentifiersForLog(identifiers: UserIdentifiers): string
```

**UserIdentifiers Interface:**
```typescript
interface UserIdentifiers {
  jid: string                    // Always available
  phoneNumber: string | null     // May be null for Business accounts
  lid: string | null             // Present for Business accounts
  pushName: string | null        // Display name
  accountType: 'regular' | 'business' | 'unknown'
  isGroup: boolean
  groupJid: string | null
}
```

**Baileys Fields Used:**
- `message.key.remoteJid` - Remote JID (full identifier)
- `message.key.participant` - Participant JID (for group messages)
- `message.key.senderLid` / `key.participantLid` - Local Identifier
- `message.key.senderPn` / `key.participantPn` - Direct phone number field
- `message.pushName` - User's display name
- `message.verifiedBizName` - Verified business name

### 3. Authorization with Multi-Identifier Lookup

**File:** `whatsapp-bot/src/middleware/authorization.ts`

**New Function:**
```typescript
// Use this function with UserIdentifiers from messages
checkAuthorizationWithIdentifiers(identifiers: UserIdentifiers): Promise<AuthorizationResult>
```

**Old Function (Deprecated):**
```typescript
// Legacy function - still works but doesn't support Business accounts as well
checkAuthorization(whatsappNumber: string): Promise<AuthorizationResult>
```

**How It Works:**
1. Calls database function `find_user_by_whatsapp_identifier()` for cascading lookup
2. If found, triggers background identifier sync (non-blocking)
3. Falls back to legacy session lookup for backward compatibility
4. Returns authorization result with user ID and permissions

### 4. Identifier Synchronization

**File:** `whatsapp-bot/src/services/user/identifier-sync.ts`

**Purpose:** Keep identifier data up-to-date as users send messages

**Key Functions:**

```typescript
// Sync user identifiers to database (called after authorization)
syncUserIdentifiers(userId: string, identifiers: UserIdentifiers): Promise<boolean>

// Check if sync is needed (compares current vs. stored identifiers)
shouldSyncIdentifiers(userId: string, identifiers: UserIdentifiers): Promise<boolean>
```

**When Sync Happens:**
- Automatically after successful authorization (background, non-blocking)
- Only when identifiers have changed (JID, LID, or account type)
- Uses database's `upsert_whatsapp_identifiers()` function

### 5. Message Flow Integration

**File:** `whatsapp-bot/src/index.ts`

**Changes:**
```typescript
// 1. Extract identifiers from every message
const userIdentifiers = extractUserIdentifiers(message, isGroup)

// 2. Log sanitized identifiers for debugging
console.log('[User Identification]', formatIdentifiersForLog(userIdentifiers))

// 3. Pass identifiers through MessageContext
await handleMessage({
  from: sender,
  userIdentifiers,  // NEW: Full identifiers
  // ... other context
})
```

**File:** `whatsapp-bot/src/handlers/core/text-handler.ts`

**Changes:**
```typescript
// Accept userIdentifiers parameter
export async function handleTextMessage(
  whatsappNumber: string,
  message: string,
  quotedMessage?: string,
  groupOwnerId?: string | null,
  userIdentifiers?: UserIdentifiers  // NEW
): Promise<string | string[]>

// Use multi-identifier authorization when available
const authResult = userIdentifiers
  ? await checkAuthorizationWithIdentifiers(userIdentifiers)
  : await checkAuthorization(whatsappNumber)
```

### 6. Type System Updates

**File:** `whatsapp-bot/src/types.ts`

**MessageContext Interface:**
```typescript
export interface MessageContext {
  from: string
  isGroup: boolean
  groupJid?: string
  groupName?: string
  message: string
  hasImage: boolean
  imageBuffer?: Buffer
  quotedMessage?: string
  userIdentifiers?: UserIdentifiers  // NEW: Full user identifiers
}
```

## Testing

**Test File:** `whatsapp-bot/src/utils/__tests__/user-identifiers.test.ts`

**Test Coverage:**
- ✅ Regular WhatsApp (phone number in JID)
- ✅ WhatsApp Business (LID suffix in JID)
- ✅ Anonymous accounts (no phone number)
- ✅ Group messages (participant extraction)
- ✅ Direct phone number fields (senderPn/participantPn)
- ✅ Phone number normalization
- ✅ User comparison (same user detection)
- ✅ Log sanitization (privacy protection)

**Run Tests:**
```bash
cd whatsapp-bot
npm test -- user-identifiers.test.ts
```

## Migration Guide

### For New Code

**Always use the multi-identifier approach:**

```typescript
// ✅ GOOD - Use multi-identifier authorization
const identifiers = extractUserIdentifiers(message, isGroup)
const authResult = await checkAuthorizationWithIdentifiers(identifiers)
```

**Avoid phone-only approach:**

```typescript
// ❌ AVOID - Old approach, doesn't support Business accounts well
const phoneNumber = extractPhoneNumber(sender)
const authResult = await checkAuthorization(phoneNumber)
```

### For Existing Code

**Backward Compatibility:**
- Old `checkAuthorization(phoneNumber)` still works
- Database migration populates JIDs from existing phone numbers
- Legacy session lookup remains functional
- No breaking changes for existing users

## Deployment Steps

### 1. Run Database Migration

```bash
# Connect to Supabase
psql $DATABASE_URL

# Run migration script
\i fe/scripts/028_multi_identifier_support.sql

# Verify new columns exist
\d authorized_whatsapp_numbers

# Verify new functions exist
\df find_user_by_whatsapp_identifier
\df upsert_whatsapp_identifiers
```

### 2. Deploy WhatsApp Bot

```bash
cd whatsapp-bot

# Install dependencies (if needed)
npm install

# Run tests
npm test

# Build production bundle
npm run build

# Deploy to Railway (or your platform)
git push
```

### 3. Verify Functionality

**Check identifier extraction in logs:**
```
[User Identification] phone:****9999, type:regular, name:John Doe
[User Identification] lid:business..., type:business, name:My Business
```

**Check authorization:**
```
[Authorization] Checking authorization with multi-identifier lookup
[Authorization] User found! User ID: abc-123-def
[Authorization] Syncing user identifiers...
[Authorization] User identifiers synced successfully
```

### 4. Monitor for Issues

**Watch for:**
- Authorization failures (should be rare with multi-identifier system)
- Database errors (check function execution)
- Sync failures (logged as non-critical warnings)

## Benefits

### ✅ Improved Reliability
- Works with WhatsApp Business accounts using LIDs
- No identification failures for anonymous accounts
- Handles account type changes (regular → business)

### ✅ Better User Experience
- Seamless support for all WhatsApp account types
- No manual intervention needed
- Automatic identifier sync keeps data fresh

### ✅ Future-Proof
- Ready for WhatsApp's evolving privacy features
- Scalable identifier system (easy to add new fields)
- Database-driven lookup (no code changes needed)

### ✅ Backward Compatible
- Existing users continue working without changes
- Legacy phone number lookup preserved
- Gradual migration as users send messages

## Technical Details

### JID Format Variations

**Regular WhatsApp:**
- Format: `[country_code][number]@s.whatsapp.net`
- Example: `5511999999999@s.whatsapp.net`
- Phone extraction: `5511999999999`

**Business with LID:**
- Format: `[country_code][number]:[lid]@s.whatsapp.net`
- Example: `5511999999999:10@s.whatsapp.net`
- Phone extraction: `5511999999999` (strip `:10`)

**Anonymous Business:**
- Format: `[anonymous_id]:[lid]@lid`
- Example: `abc123xyz:45@lid`
- Phone extraction: `null` (no phone number)

### Performance Considerations

**Database Indexes:**
- Primary lookup via `whatsapp_jid` (indexed) - O(log n)
- Fallback via `whatsapp_lid` (indexed) - O(log n)
- Fallback via `whatsapp_number` (indexed) - O(log n)

**Sync Strategy:**
- Background sync (non-blocking)
- Only syncs when identifiers change
- Single database round-trip via RPC function

**Caching:**
- Authorization result cached in session
- Reduces database calls per message
- Identifier sync happens once per identifier change

## Troubleshooting

### Issue: User Not Found

**Symptoms:**
```
[Authorization] User not authorized
```

**Check:**
1. Is the user in `authorized_whatsapp_numbers`?
2. Does the JID match exactly?
3. Check database function output:
   ```sql
   SELECT * FROM find_user_by_whatsapp_identifier(
     'user@s.whatsapp.net',  -- p_jid
     NULL,                   -- p_lid
     '5511999999999'         -- p_phone_number
   );
   ```

### Issue: Identifier Sync Failures

**Symptoms:**
```
[Authorization] Failed to sync identifiers (non-critical)
```

**Check:**
1. Database function exists: `upsert_whatsapp_identifiers`
2. Service role has execute permission
3. User ID is valid UUID
4. Check database logs for errors

### Issue: Wrong Account Type Detection

**Symptoms:**
- Business account detected as `regular`
- Regular account detected as `business`

**Check:**
1. Verify Baileys message structure:
   ```typescript
   console.log('Message key:', message.key)
   console.log('Verified biz name:', message.verifiedBizName)
   ```
2. Check LID extraction:
   ```typescript
   console.log('Sender LID:', message.key.senderLid)
   console.log('Participant LID:', message.key.participantLid)
   ```

## Future Enhancements

### Potential Improvements

1. **Identifier History Tracking**
   - Store identifier changes over time
   - Detect account migrations
   - Audit trail for security

2. **Multi-Device Support**
   - Handle same user from multiple devices
   - Each device may have different JID
   - Link devices to single user account

3. **Proactive Identifier Refresh**
   - Periodic background sync for all users
   - Detect WhatsApp platform changes early
   - Update identifier metadata

4. **Enhanced Analytics**
   - Track identifier type distribution
   - Monitor sync success rates
   - Identify patterns in Business account usage

## References

- **Baileys Documentation:** https://github.com/WhiskeySockets/Baileys
- **WhatsApp Business API:** https://developers.facebook.com/docs/whatsapp
- **Migration Script:** `fe/scripts/028_multi_identifier_support.sql`
- **Implementation:** `whatsapp-bot/src/utils/user-identifiers.ts`
- **Tests:** `whatsapp-bot/src/utils/__tests__/user-identifiers.test.ts`
