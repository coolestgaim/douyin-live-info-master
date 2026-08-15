import { describe, it, expect } from 'vitest'
import { parse, getFieldString, getIntField } from '../electron/services/protobuf-parser'

// protobuf 编码小工具（仅测试用）
function encodeVarint(value: number): Buffer {
  const bytes: number[] = []
  let v = value
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  bytes.push(v)
  return Buffer.from(bytes)
}

function tag(field: number, wireType: number): Buffer {
  return encodeVarint((field << 3) | wireType)
}

describe('protobuf-parser', () => {
  it('解析 varint 字段（type 0）', () => {
    // field 1, wire type 0, value 42
    const data = Buffer.concat([tag(1, 0), encodeVarint(42)])
    const result = parse(data)
    expect(result['f1']).toBe(42)
  })

  it('解析字符串字段（type 2）', () => {
    // field 2, wire type 2, len 5, "hello"
    const data = Buffer.concat([tag(2, 2), encodeVarint(5), Buffer.from('hello', 'utf-8')])
    const result = parse(data)
    expect(result['f2']).toBe('hello')
    expect(getFieldString(result, 'f2')).toBe('hello')
  })

  it('解析嵌套消息', () => {
    // field 3 内嵌 { field 1: 7 }
    const inner = Buffer.concat([tag(1, 0), encodeVarint(7)])
    const data = Buffer.concat([tag(3, 2), encodeVarint(inner.length), inner])
    const result = parse(data)
    expect(result['f3']).toEqual({ f1: 7 })
  })

  it('二进制内容回退为 HEX', () => {
    // 含控制字符（0x03 = 无效 wire type）→ 嵌套解析失败 → hex 大写
    const bytes = Buffer.from([0x03])
    const data = Buffer.concat([tag(5, 2), encodeVarint(bytes.length), bytes])
    const result = parse(data)
    expect(result['f5']).toBe('03')
  })

  it('固定 32 位字段（type 5）', () => {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(1000)
    const data = Buffer.concat([tag(7, 5), buf])
    const result = parse(data)
    expect(result['f7']).toBe(1000)
  })

  it('空数据返回空对象', () => {
    expect(parse(Buffer.alloc(0))).toEqual({})
  })

  it('截断数据不崩溃', () => {
    // tag 说长度 10 但只有 2 字节
    const data = Buffer.concat([tag(2, 2), encodeVarint(10), Buffer.from('ab')])
    const result = parse(data)
    expect(result['f2']).toBeUndefined()
    expect(getIntField(result, 'f1', 99)).toBe(99)
  })
})
