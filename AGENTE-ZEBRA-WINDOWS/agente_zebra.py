"""Agente de impressão local Manaíra Board V74.22. Windows, Python 3, sem dependências.
Execute somente em computador confiável. Porta HTTP limitada a loopback.
"""
import ctypes
import json
import os
import re
import secrets
import subprocess
from ctypes import wintypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 18719
TOKEN = secrets.token_urlsafe(24)
DPM = 203 / 25.4

def dots(mm): return int(round(float(mm)*DPM))

def list_printers():
    if os.name != 'nt':
        raise RuntimeError('Este agente só funciona no Windows.')
    script = "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress"
    r = subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],capture_output=True,text=True,timeout=12,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if r.returncode: raise RuntimeError(r.stderr.strip() or 'Falha ao consultar impressoras Windows.')
    data=json.loads(r.stdout.strip() or '[]')
    return sorted([data] if isinstance(data,str) else data,key=str.casefold)

def price_num(value):
    value=float(value)
    return f'{value:,.2f}'.replace(',','_').replace('.',',').replace('_','.')

def ztext(s):
    raw=str(s or '').upper()
    raw=(raw.replace('Á','A').replace('À','A').replace('Â','A').replace('Ã','A').replace('É','E').replace('Ê','E').replace('Í','I').replace('Ó','O').replace('Ô','O').replace('Õ','O').replace('Ú','U').replace('Ü','U').replace('Ç','C'))
    return ''.join(c if (' ' <= c <= '~' and c not in '^~_\\') else ' ' for c in raw)

def build_zpl(item,settings):
    width=float(settings.get('width',105));height=float(settings.get('height',30))
    copies=int(settings.get('copies',1));x=float(settings.get('x',0));y=float(settings.get('y',0))
    if not 55<=width<=150 or not 20<=height<=90 or not 1<=copies<=100 or not -20<=x<=20 or not -20<=y<=20:raise ValueError('Dimensões/cópias fora dos limites permitidos.')
    norm=float(item.get('normal',0));price=float(item.get('price',0));promo=item.get('promo') is True
    if not (0 < price <= 100000 and 0 < norm <= 100000):raise ValueError('Preço inválido.')
    if promo and price>=norm:raise ValueError('Preço promocional não é menor que o normal.')
    desc=ztext(item.get('description',''))[:90]
    ean=re.sub(r'\D','',str(item.get('ean','')))
    if not ean:raise ValueError('Produto sem EAN: impressão automática bloqueada.')

    # V74.22: coordenadas em mm relativas à largura/altura configuradas.
    # Área da logo pré-impressa no canto inferior direito: não enviar tinta.
    w=dots(width);h=dots(height);ox=dots(x);oy=dots(y)
    def X(fraction):return max(0,ox+int(w*fraction))
    def Y(fraction):return max(0,oy+int(h*fraction))
    def font(hfrac,wfrac):return max(12,int(h*hfrac)),max(9,int(w*wfrac))
    left=X(.023)
    desc_h,desc_w=font(.155,.016)
    # Letras estreitas sem reticências, como no modelo de referência.
    max_chars=max(18,int((w*.93)/max(1,desc_w*.66)))
    desc=desc[:max_chars]
    bar_h=max(24,int(h*.23))
    bar_y=Y(.55)
    ean_y=Y(.80)
    price_h,price_w=font(.36,.030)
    # Preço mantém margem de segurança para não invadir logo à direita.
    price_str=price_num(price)
    if len(price_str)>5:
        price_h,price_w=font(.30,.022)
    parts=[
        '^XA','^CI27',f'^PW{w}',f'^LL{h}','^LH0,0',
        f'^FO{left},{Y(.065)}^A0N,{desc_h},{desc_w}^FD{desc}^FS',
        f'^FO{left},{bar_y}^BY{2 if width>=95 else 1},2,{bar_h}^BCN,{bar_h},N,N,N^FD{ean}^FS',
        f'^FO{left},{ean_y}^A0N,{max(14,int(h*.083))},{max(9,int(h*.043))}^FD{ean}^FS',
    ]
    if promo:
        parts.extend([
            f'^FO{X(.515)},{Y(.35)}^A0N,{max(19,int(h*.10))},{max(10,int(h*.038))}^FDDe: {price_num(norm)}^FS',
            f'^FO{X(.545)},{Y(.47)}^A0N,{max(19,int(h*.10))},{max(10,int(h*.038))}^FDPor:^FS',
            f'^FO{X(.63)},{Y(.55)}^A0N,{price_h},{price_w}^FD{price_str}^FS',
        ])
    else:
        parts.extend([
            f'^FO{X(.515)},{Y(.54)}^A0N,{max(23,int(h*.12))},{max(11,int(h*.048))}^FDR$^FS',
            f'^FO{X(.65)},{Y(.46)}^A0N,{price_h},{price_w}^FD{price_str}^FS',
        ])
    parts.append(f'^PQ{copies},0,1,N')
    parts.append('^XZ')
    return '\n'.join(parts).encode('ascii')

def print_raw(printer,data):
    winspool=ctypes.WinDLL('winspool.drv')
    OpenPrinter=winspool.OpenPrinterW;OpenPrinter.argtypes=[wintypes.LPWSTR,ctypes.POINTER(wintypes.HANDLE),wintypes.LPVOID];OpenPrinter.restype=wintypes.BOOL
    ClosePrinter=winspool.ClosePrinter;ClosePrinter.argtypes=[wintypes.HANDLE]
    class DOC_INFO_1(ctypes.Structure):
        _fields_=[('pDocName',wintypes.LPWSTR),('pOutputFile',wintypes.LPWSTR),('pDatatype',wintypes.LPWSTR)]
    StartDocPrinter=winspool.StartDocPrinterW;StartDocPrinter.argtypes=[wintypes.HANDLE,wintypes.DWORD,ctypes.POINTER(DOC_INFO_1)];StartDocPrinter.restype=wintypes.DWORD
    StartPagePrinter=winspool.StartPagePrinter;StartPagePrinter.argtypes=[wintypes.HANDLE]
    WritePrinter=winspool.WritePrinter;WritePrinter.argtypes=[wintypes.HANDLE,wintypes.LPVOID,wintypes.DWORD,ctypes.POINTER(wintypes.DWORD)];WritePrinter.restype=wintypes.BOOL
    EndPagePrinter=winspool.EndPagePrinter;EndPagePrinter.argtypes=[wintypes.HANDLE]
    EndDocPrinter=winspool.EndDocPrinter;EndDocPrinter.argtypes=[wintypes.HANDLE]
    handle=wintypes.HANDLE()
    if not OpenPrinter(printer,ctypes.byref(handle),None):raise ctypes.WinError()
    try:
        doc=DOC_INFO_1('Manaira Board - Etiqueta ZPL',None,'RAW');job=StartDocPrinter(handle,1,ctypes.byref(doc))
        if not job:raise ctypes.WinError()
        try:
            if not StartPagePrinter(handle):raise ctypes.WinError()
            try:
                buffer=ctypes.create_string_buffer(data);written=wintypes.DWORD(0)
                if not WritePrinter(handle,buffer,len(data),ctypes.byref(written)) or written.value!=len(data):raise ctypes.WinError()
            finally:EndPagePrinter(handle)
        finally:EndDocPrinter(handle)
        return job
    finally:ClosePrinter(handle)

class Handler(BaseHTTPRequestHandler):
    def log_message(self,format,*args):pass
    def reply(self,status,payload):
        body=json.dumps(payload,ensure_ascii=False).encode('utf8')
        self.send_response(status)
        origin=self.headers.get('Origin','')
        if origin.startswith(('http://','https://')) and len(origin)<300 and '\n' not in origin and '\r' not in origin:
            self.send_header('Access-Control-Allow-Origin',origin)
            self.send_header('Vary','Origin')
        self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type, X-Manaira-Print-Token')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_OPTIONS(self):self.reply(200,{})
    def authorized(self):
        if not secrets.compare_digest(self.headers.get('X-Manaira-Print-Token',''),TOKEN):
            self.reply(401,{'error':'Código de pareamento inválido. Consulte a janela do agente local.'});return False
        return True
    def do_GET(self):
        if not self.authorized():return
        if self.path!='/printers':return self.reply(404,{'error':'Rota desconhecida.'})
        try:self.reply(200,{'printers':list_printers()})
        except Exception as e:self.reply(500,{'error':str(e)})
    def do_POST(self):
        if not self.authorized():return
        if self.path!='/print':return self.reply(404,{'error':'Rota desconhecida.'})
        try:
            length=int(self.headers.get('Content-Length',0))
            if not 0<length<8192:raise ValueError('Conteúdo muito grande ou vazio.')
            data=json.loads(self.rfile.read(length))
            printer=data.get('printer','')
            if printer not in list_printers():raise ValueError('Impressora não encontrada no computador.')
            raw=build_zpl(data.get('product') or {},data.get('settings') or {})
            job=print_raw(printer,raw)
            self.reply(200,{'job':job,'queued':True})
        except Exception as e:self.reply(400,{'error':str(e)})

if __name__=='__main__':
    if os.name!='nt':raise SystemExit('Execute o agente no Windows.')
    print('\nMANAIRA BOARD - AGENTE ZEBRA V74.22')
    print('Acesso local: http://127.0.0.1:%s' % PORT)
    print('\nCODIGO DE PAREAMENTO (copiar em Cartazes > Etiquetas Zebra):\n'+TOKEN+'\n')
    print('Nao feche esta janela enquanto imprimir. Ctrl+C para encerrar.\n')
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
