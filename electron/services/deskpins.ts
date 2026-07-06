// DeskPins — 外部窗口置顶/取消置顶（Windows API via PowerShell）
import { execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

interface WindowInfo { hwnd: string; title: string; pid: number }

const LIST_SCRIPT = `[Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;using System.Collections.Generic;
public class WE{
public delegate bool EW(IntPtr h,IntPtr l);
[DllImport("user32")]public static extern bool EnumWindows(EW f,IntPtr l);
[DllImport("user32")]public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32")]public static extern int GetWindowText(IntPtr h,StringBuilder t,int n);
[DllImport("user32")]public static extern int GetWindowTextLength(IntPtr h);
[DllImport("user32")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
public static string GetJson(){
var w=new System.Text.StringBuilder();w.Append("[");
bool first=true;
EnumWindows((h,l)=>{
if(IsWindowVisible(h)){
int len=GetWindowTextLength(h);var sb=new StringBuilder(len+1);GetWindowText(h,sb,sb.Capacity);
string t=sb.ToString();
if(!string.IsNullOrEmpty(t)&&t!="Program Manager"){
uint pid;GetWindowThreadProcessId(h,out pid);
if(!first)w.Append(",");first=false;
w.Append("{\\"h\\":\\""+h.ToString()+"\\",\\"t\\":\\""+t.Replace("\\\\","\\\\\\\\").Replace("\\"","\\\\\\"")+"\\",\\"p\\":"+pid+"}");
}}return true;},IntPtr.Zero);
w.Append("]");return w.ToString();}}
"@
[WE]::GetJson()
`

const PIN_SCRIPT = `Add-Type @"
using System;using System.Runtime.InteropServices;
public class WP{
[DllImport("user32")]public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int w,int h,uint f);
static readonly IntPtr T=new IntPtr(-1);
const uint N=0x0002;const uint S=0x0001;
public static void P(IntPtr h){SetWindowPos(h,T,0,0,0,0,N|S);}
public static void U(IntPtr h){SetWindowPos(h,new IntPtr(-2),0,0,0,0,N|S);}
}
"@
[IntPtr]$h=[IntPtr]::Parse("__HWND__");[WP]::P($h)
`

const UNPIN_SCRIPT = `Add-Type @"
using System;using System.Runtime.InteropServices;
public class WP{
[DllImport("user32")]public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int w,int h,uint f);
static readonly IntPtr T=new IntPtr(-1);
const uint N=0x0002;const uint S=0x0001;
public static void P(IntPtr h){SetWindowPos(h,T,0,0,0,0,N|S);}
public static void U(IntPtr h){SetWindowPos(h,new IntPtr(-2),0,0,0,0,N|S);}
}
"@
[IntPtr]$h=[IntPtr]::Parse("__HWND__");[WP]::U($h)
`

function runPowershell(script: string, timeout = 5000): string {
  const tmpPath = path.join(require('os').tmpdir(), `ps_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`)
  // 写 UTF-8 BOM 确保 PowerShell 正确识别编码
  fs.writeFileSync(tmpPath, '\uFEFF' + script, 'utf-8')
  try {
    return execSync(`chcp 65001 >nul && powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPath}"`, {
      timeout, encoding: 'utf-8', windowsHide: true,
    })
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
}

export function listWindows(): WindowInfo[] {
  try {
    const out = runPowershell(LIST_SCRIPT)
    // 找 JSON 数组（可能在杂讯后面）
    const match = out.match(/\[[\s\S]*\]/)
    if (!match) return []
    const arr = JSON.parse(match[0])
    return arr.map((item: any) => ({
      hwnd: item.h,
      title: item.t,
      pid: item.p || 0,
    }))
  } catch { return [] }
}

export function pinWindow(hwnd: string): boolean {
  try { runPowershell(PIN_SCRIPT.replace('__HWND__', hwnd), 3000); return true }
  catch { return false }
}

export function unpinWindow(hwnd: string): boolean {
  try { runPowershell(UNPIN_SCRIPT.replace('__HWND__', hwnd), 3000); return true }
  catch { return false }
}
