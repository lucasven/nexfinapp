#!/usr/bin/env ts-node
/**
 * OCR Text Extraction Utility
 *
 * Extracts OCR text from images for prompt engineering and analysis
 *
 * Usage:
 *   npm run extract-ocr <image-path> [<image-path2> ...]
 *   npm run extract-ocr samples/*.jpg
 *
 * Examples:
 *   npm run extract-ocr receipt.jpg
 *   npm run extract-ocr images/receipt1.jpg images/bank-statement.jpg
 */

import { createWorker } from 'tesseract.js'
import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'

interface OCRSample {
  filename: string
  filepath: string
  text: string
  confidence: number
  timestamp: string
  imageSize: { width: number; height: number }
}

async function extractOCRFromImage(imagePath: string): Promise<OCRSample> {
  console.log(`\n📷 Processing: ${imagePath}`)

  // Read image
  const imageBuffer = await fs.readFile(imagePath)

  // Get image metadata
  const metadata = await sharp(imageBuffer).metadata()

  // Preprocess image (same as production)
  const processedImage = await sharp(imageBuffer)
    .greyscale()
    .normalize()
    .sharpen()
    .toBuffer()

  // Initialize Tesseract worker with Portuguese
  console.log('   🔍 Running OCR...')
  const worker = await createWorker('por')

  const { data: { text, confidence } } = await worker.recognize(processedImage)
  await worker.terminate()

  console.log(`   ✅ Confidence: ${confidence.toFixed(2)}%`)
  console.log(`   📝 Extracted ${text.length} characters`)

  return {
    filename: path.basename(imagePath),
    filepath: imagePath,
    text: text.trim(),
    confidence: Math.round(confidence * 100) / 100,
    timestamp: new Date().toISOString(),
    imageSize: {
      width: metadata.width || 0,
      height: metadata.height || 0
    }
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log(`
📸 OCR Text Extraction Utility

Usage:
  npm run extract-ocr <image-path> [<image-path2> ...]

Examples:
  npm run extract-ocr receipt.jpg
  npm run extract-ocr samples/receipt1.jpg samples/bank-statement.jpg
  npm run extract-ocr samples/*.jpg

The extracted text will be:
  1. Printed to console
  2. Saved to ocr-samples.json
    `)
    process.exit(1)
  }

  console.log(`🚀 Starting OCR extraction for ${args.length} image(s)...\n`)

  const samples: OCRSample[] = []

  for (const imagePath of args) {
    try {
      const sample = await extractOCRFromImage(imagePath)
      samples.push(sample)

      // Print extracted text
      console.log('\n' + '='.repeat(80))
      console.log(`📄 EXTRACTED TEXT FROM: ${sample.filename}`)
      console.log('='.repeat(80))
      console.log(sample.text)
      console.log('='.repeat(80) + '\n')

    } catch (error) {
      console.error(`❌ Error processing ${imagePath}:`, error)
    }
  }

  // Save to file
  const outputFile = 'ocr-samples.json'
  await fs.writeFile(
    outputFile,
    JSON.stringify(samples, null, 2),
    'utf-8'
  )

  console.log(`\n✅ Extraction complete!`)
  console.log(`📁 Saved ${samples.length} sample(s) to: ${outputFile}`)
  console.log(`\n💡 Tip: Use this data to improve your OCR prompt in ai-pattern-generator.ts`)

  // Print summary
  console.log('\n📊 Summary:')
  samples.forEach((sample, i) => {
    console.log(`   ${i + 1}. ${sample.filename}`)
    console.log(`      Confidence: ${sample.confidence}%`)
    console.log(`      Length: ${sample.text.length} chars`)
    console.log(`      Size: ${sample.imageSize.width}x${sample.imageSize.height}`)
  })
}

main().catch(console.error)
