export interface ProtobufMap { [key: string]: unknown }

export function parse(data: Buffer): ProtobufMap {
  const result: ProtobufMap = {}
  let offset = 0

  while (offset < data.length) {
    const tagR = tryReadVarint(data, offset)
    if (!tagR) break
    offset = tagR.newOffset
    const tag = Number(tagR.value)
    const fieldId = tag >> 3
    const fieldType = tag & 0x07

    if (fieldType === 0) {
      const r = tryReadVarint(data, offset)
      if (!r) break
      offset = r.newOffset
      result[`f${fieldId}`] = Number(r.value)
    } else if (fieldType === 1) {
      if (offset + 8 > data.length) break
      result[`f${fieldId}`] = data.readBigUInt64LE(offset)
      offset += 8
    } else if (fieldType === 2) {
      const lenR = tryReadVarint(data, offset)
      if (!lenR) break
      offset = lenR.newOffset
      const length = Number(lenR.value)
      if (offset + length > data.length) break
      const bytes = data.subarray(offset, offset + length)
      offset += length
      const text = bytes.toString('utf-8')
      if (!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
        result[`f${fieldId}`] = text
      } else {
        try {
          const nested = parse(bytes)
          if (Object.keys(nested).length > 0) result[`f${fieldId}`] = nested
          else result[`f${fieldId}`] = bytes.toString('hex').toUpperCase()
        } catch {
          result[`f${fieldId}`] = bytes.toString('hex').toUpperCase()
        }
      }
    } else if (fieldType === 5) {
      if (offset + 4 > data.length) break
      result[`f${fieldId}`] = data.readUInt32LE(offset)
      offset += 4
    } else {
      break
    }
  }

  return result
}

interface VarintResult { value: bigint; newOffset: number }

function tryReadVarint(data: Buffer, offset: number): VarintResult | null {
  let value = 0n
  let shift = 0
  while (offset < data.length) {
    const b = data[offset++]
    value |= BigInt(b & 0x7F) << BigInt(shift)
    if ((b & 0x80) === 0) return { value, newOffset: offset }
    shift += 7
    if (shift > 63) return null
  }
  return null
}

export function getFieldString(data: ProtobufMap, key: string): string | undefined {
  const val = data[key]
  return typeof val === 'string' ? val : undefined
}

export function getFieldDict(data: ProtobufMap, key: string): ProtobufMap | undefined {
  const val = data[key]
  return val && typeof val === 'object' && !Buffer.isBuffer(val) ? val as ProtobufMap : undefined
}

export function extractRepeatedField(data: Buffer, fieldNumber: number): Buffer[] {
  const results: Buffer[] = []
  let offset = 0

  while (offset < data.length) {
    const tagR = tryReadVarint(data, offset)
    if (!tagR) break
    offset = tagR.newOffset
    const tag = Number(tagR.value)
    const fieldId = tag >> 3
    const fieldType = tag & 0x07

    if (fieldType === 0) {
      const r = tryReadVarint(data, offset)
      if (!r) break
      offset = r.newOffset
    } else if (fieldType === 1) {
      if (offset + 8 > data.length) break
      offset += 8
    } else if (fieldType === 2) {
      const lenR = tryReadVarint(data, offset)
      if (!lenR) break
      offset = lenR.newOffset
      const length = Number(lenR.value)
      if (offset + length > data.length) break
      if (fieldId === fieldNumber) {
        results.push(Buffer.from(data.subarray(offset, offset + length)))
      }
      offset += length
    } else if (fieldType === 5) {
      if (offset + 4 > data.length) break
      offset += 4
    } else {
      break
    }
  }

  return results
}

export function getIntField(d: ProtobufMap, k: string, def: number): number {
  const v = d[k]
  if (v === undefined) return def
  if (typeof v === 'number') return v
  if (typeof v === 'bigint') return Number(v)
  return def
}

export function getLongField(d: ProtobufMap, k: string, def: number): number {
  const v = d[k]
  if (v === undefined) return def
  if (typeof v === 'number') return v
  if (typeof v === 'bigint') return Number(v)
  return def
}

export function getBoolField(d: ProtobufMap, k: string): boolean {
  const v = d[k]
  if (v === undefined) return false
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'bigint') return v !== 0n
  if (typeof v === 'boolean') return v
  return false
}

export function getBytesField(d: ProtobufMap, k: string): Buffer | null {
  const val = d[k]
  if (!val) return null
  if (Buffer.isBuffer(val)) return val
  if (typeof val === 'string') {
    try { return Buffer.from(val, 'hex') } catch { return null }
  }
  return null
}
