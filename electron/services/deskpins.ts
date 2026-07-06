// DeskPins — 外部窗口置顶/取消置顶（Windows API via PowerShell）
import { execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

interface WindowInfo { hwnd: string; title: string; pid: number }

// PowerShell 脚本，内嵌 C# 调用 Win32 API
const LIST_SCRIPT = `
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;using System.Collections.Generic;
public class WE{
public delegate bool EW(IntPtr h,IntPtr l);
[DllImport("user32")]public static extern bool EnumWindows(EW f,IntPtr l);
[DllImport("user32")]public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32")]public static extern int GetWindowText(IntPtr h,StringBuilder t,int n);
[DllImport("user32")]public static extern int GetWindowTextLength(IntPtr h);
[DllImport("user32")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
public static List<Tuple<IntPtr,string,uint>> Get(){
var w=new List<Tuple<IntPtr,string,uint>>();
EnumWindows((h,l)=>{
if(IsWindowVisible(h)){
int len=GetWindowTextLength(h);var sb=new StringBuilder(len+1);GetWindowText(h,sb,sb.Capacity);
string t=sb.ToString();
if(!string.IsNullOrEmpty(t)&&t!="Program Manager"){
uint pid;GetWindowThreadProcessId(h,out pid);
w.Add(Tuple.Create(h,t,pid));
}}return true;},IntPtr.Zero);
return w;
}}
"@
[WE]::Get()|%{$_.Item1.ToString()+"|"+$_.Item2+"|"+$_.Item3}|Write-Output
`

const PIN_SCRIPT = `
Add-Type @"
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

const UNPIN_SCRIPT = `
Add-Type @"
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

function runPowershell(script: string): string {
  const tmpPath = path.join(require('os').tmpdir(), `ps_${Date.now()}.ps1`)
  fs.writeFileSync(tmpPath, script, 'utf-8')
  try {
    return execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPath}"`, {
      timeout: 5000, encoding: 'utf-8', windowsHide: true,
    })
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
}

export function listWindows(): WindowInfo[] {
  try {
    const out = runPowershell(LIST_SCRIPT)
    return out.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [hwnd, title, pid] = line.split('|')
      return { hwnd, title, pid: parseInt(pid) || 0 }
    })
  } catch { return [] }
}

export function pinWindow(hwnd: string): boolean {
  try { runPowershell(PIN_SCRIPT.replace('__HWND__', hwnd)); return true }
  catch { return false }
}

export function unpinWindow(hwnd: string): boolean {
  try { runPowershell(UNPIN_SCRIPT.replace('__HWND__', hwnd)); return true }
  catch { return false }
}
