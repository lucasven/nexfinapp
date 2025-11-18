# OCR Text Extraction Guide

This guide explains how to extract OCR text from images for prompt engineering and testing.

## Quick Start

```bash
cd whatsapp-bot

# Extract from a single image
npm run extract-ocr path/to/receipt.jpg

# Extract from multiple images
npm run extract-ocr samples/receipt1.jpg samples/receipt2.jpg samples/sms.jpg

# Extract from all images in a folder
npm run extract-ocr samples/*.jpg
npm run extract-ocr samples/*.png
```

## What It Does

The script:
1. ✅ Processes images using the same pipeline as production (greyscale, normalize, sharpen)
2. ✅ Extracts text using Tesseract OCR (Portuguese language)
3. ✅ Shows confidence score for each extraction
4. ✅ Prints extracted text to console
5. ✅ Saves all samples to `ocr-samples.json` for later analysis

## Output

### Console Output
```
📷 Processing: receipt.jpg
   🔍 Running OCR...
   ✅ Confidence: 87.45%
   📝 Extracted 234 characters

================================================================================
📄 EXTRACTED TEXT FROM: receipt.jpg
================================================================================
Compra aprovada no LATAM PASS
MC BLACK p/ ISMAIRA O
VENTURELL - MINIMERCADO
PAQUISTAO valor RS 8,50 em
13/10/2025 as 17h50.
================================================================================
```

### File Output (`ocr-samples.json`)
```json
[
  {
    "filename": "receipt.jpg",
    "filepath": "samples/receipt.jpg",
    "text": "Compra aprovada no LATAM PASS\nMC BLACK p/ ISMAIRA O\nVENTURELL...",
    "confidence": 87.45,
    "timestamp": "2025-11-17T20:30:45.123Z",
    "imageSize": {
      "width": 1080,
      "height": 1920
    }
  }
]
```

## Use Cases

### 1. Collect Real OCR Samples
```bash
# Save screenshots from WhatsApp to samples/ folder
npm run extract-ocr samples/*.jpg

# Review ocr-samples.json to see actual OCR output
```

### 2. Test OCR Accuracy
Compare the extracted text with the actual image to identify:
- Common OCR errors (0 vs O, 1 vs I, etc.)
- Text fragmentation issues
- Missing or extra spaces
- Date format variations

### 3. Improve AI Prompts
Use the real OCR samples to:
- Add examples to your OCR prompt
- Identify patterns that need special handling
- Test prompt variations with real data

### 4. Debug Production Issues
If a user reports an image not working:
1. Get the image from them
2. Run `npm run extract-ocr problem-image.jpg`
3. See exactly what OCR text is produced
4. Test if the AI can parse it

## Tips

### Best Practice for Sample Collection
```bash
# Create a samples directory
mkdir -p samples

# Organize by type
mkdir -p samples/credit-card-sms
mkdir -p samples/bank-statements
mkdir -p samples/receipts

# Extract all at once
npm run extract-ocr samples/**/*.jpg
```

### Analyzing Patterns
After collecting samples, look for:
- **Common merchants**: Which ones appear most often?
- **OCR errors**: What character confusions happen?
- **Format variations**: Different date formats, amount styles, etc.
- **Edge cases**: Very short text, very long text, multiple transactions

### Using Samples for Prompt Engineering
1. Pick 3-5 representative samples
2. Add them as examples in `createOCRSystemPrompt()` in `ai-pattern-generator.ts`
3. Include both the raw OCR text AND the expected output
4. Cover different document types (SMS, bank statement, receipt)

## Example Workflow

```bash
# 1. Collect samples from users
npm run extract-ocr user-samples/*.jpg

# 2. Review the output
cat ocr-samples.json | jq '.[].text'

# 3. Identify patterns
cat ocr-samples.json | jq '.[].confidence' | sort -n

# 4. Add best examples to OCR prompt
# Edit: whatsapp-bot/src/services/ai/ai-pattern-generator.ts
# Function: createOCRSystemPrompt()

# 5. Test with the samples
# (manually test or create automated test)
```

## Troubleshooting

### Script won't run
```bash
# Make sure you're in the whatsapp-bot directory
cd whatsapp-bot

# Install dependencies if needed
npm install
```

### "Cannot find module 'tesseract.js'"
```bash
npm install
```

### Low confidence scores
- Try better quality images
- Ensure images have good contrast
- Avoid very small text
- Check if the image is rotated

### Wrong language detected
The script uses Portuguese (`por`). If you need English, edit the script:
```typescript
const worker = await createWorker('eng')  // Change 'por' to 'eng'
```

## Advanced Usage

### Process images programmatically
```typescript
import { extractOCRFromImage } from './src/scripts/extract-ocr-samples'

const sample = await extractOCRFromImage('my-image.jpg')
console.log(sample.text)
console.log(`Confidence: ${sample.confidence}%`)
```

### Custom output location
Edit the script to change output file:
```typescript
const outputFile = 'my-custom-samples.json'
```

## Next Steps

After collecting samples:
1. Review `ocr-samples.json` for patterns
2. Update OCR prompt in `ai-pattern-generator.ts`
3. Test with the new prompt
4. Iterate based on results

---

**Created by**: Claude Code
**Last updated**: 2025-11-17
