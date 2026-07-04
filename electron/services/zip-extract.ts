import * as zlib from 'zlib'
import * as fs from 'fs'

interface ZipEntry {
  name: string
  compressedSize: number
  uncompressedSize: number
  compressionMethod: number
  localHeaderOffset: number
}

/**
 * Find a zip entry's data offset and compressed size.
 * Returns null if not found, or a descriptor string for extract().
 */
export function findEntry(buf: Buffer, targetName: string): string | null {
  const entries = readCentralDirectory(buf)
  const normalized = targetName.replace(/\\/g, '/')
  for (const e of entries) {
    if (e.name === normalized) {
      return JSON.stringify(e)
    }
  }
  return null
}

/**
 * Extract a single zip entry to destPath.
 * entryJson: JSON-serialized ZipEntry from findEntry()
 */
export function extract(zipPath: string, entryJson: string, destPath: string): void {
  const entry: ZipEntry = JSON.parse(entryJson)
  const fd = fs.openSync(zipPath, 'r')

  try {
    // Read local file header to skip to file data
    const localHeader = Buffer.alloc(30)
    fs.readSync(fd, localHeader, 0, 30, entry.localHeaderOffset)

    const nameLen = localHeader.readUInt16LE(26)
    const extraLen = localHeader.readUInt16LE(28)
    const dataOffset = entry.localHeaderOffset + 30 + nameLen + extraLen

    // Read compressed data
    const compressed = Buffer.alloc(entry.compressedSize)
    fs.readSync(fd, compressed, 0, entry.compressedSize, dataOffset)

    // Decompress
    let decompressed: Buffer
    if (entry.compressionMethod === 0) {
      decompressed = compressed
    } else if (entry.compressionMethod === 8) {
      decompressed = zlib.inflateRawSync(compressed)
    } else {
      throw new Error(`Unsupported compression method: ${entry.compressionMethod}`)
    }

    fs.writeFileSync(destPath, decompressed)
  } finally {
    fs.closeSync(fd)
  }
}

function readCentralDirectory(buf: Buffer): ZipEntry[] {
  // Find end of central directory record (starts with 0x06054b50)
  const eocdOffset = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocdOffset < 0) throw new Error('Not a valid zip file')

  const eocd = buf.subarray(eocdOffset)
  const totalEntries = eocd.readUInt16LE(10)
  const cdOffset = eocd.readUInt32LE(16)

  const entries: ZipEntry[] = []
  let pos = cdOffset

  for (let i = 0; i < totalEntries; i++) {
    const sig = buf.readUInt32LE(pos)
    if (sig !== 0x02014b50) break

    const compressionMethod = buf.readUInt16LE(pos + 10)
    const compressedSize = buf.readUInt32LE(pos + 20)
    const uncompressedSize = buf.readUInt32LE(pos + 24)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const localHeaderOffset = buf.readUInt32LE(pos + 42)

    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8')

    entries.push({ name, compressedSize, uncompressedSize, compressionMethod, localHeaderOffset })
    pos += 46 + nameLen + extraLen + commentLen
  }

  return entries
}
