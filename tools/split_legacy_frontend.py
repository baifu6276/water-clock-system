from pathlib import Path
import re

legacy_path = Path("js/legacy-app.js")
if not legacy_path.exists():
    raise SystemExit("找不到 js/legacy-app.js")

src = legacy_path.read_text(encoding="utf-8")
markers = [
    "// 系統設定",
    "// 系統資料",
    "// 畫面載入",
    "// 顯示工地",
    "// 呼叫 GAS API",
    "// 每日回報 V1.1 - 多工作項目",
    "// 管理員補卡 V1",
    "// 薪資結算 V1",
    "// 出勤日結 V1",
    "// 按鈕控制",
    "// 防止 HTML 注入",
]

pos = {}
for marker in markers:
    count = src.count(marker)
    if count != 1:
        raise SystemExit(f"標記數量異常：{marker}，找到 {count} 次")
    pos[marker] = src.index(marker)

ordered = [pos[m] for m in markers]
if ordered != sorted(ordered):
    raise SystemExit("程式區塊順序與預期不符，停止自動拆分")


def part(start, end=None):
    a = pos[start]
    b = pos[end] if end else len(src)
    return src[a:b].strip() + "\n"


config = part("// 系統設定", "// 系統資料")
state = part("// 系統資料", "// 畫面載入")
auth = part("// 畫面載入", "// 顯示工地")
attendance_main = part("// 顯示工地", "// 呼叫 GAS API")
api = part("// 呼叫 GAS API", "// 每日回報 V1.1 - 多工作項目")
daily = part("// 每日回報 V1.1 - 多工作項目", "// 管理員補卡 V1")
admin_entry = part("// 管理員補卡 V1", "// 薪資結算 V1")
payroll = part("// 薪資結算 V1", "// 出勤日結 V1")
admin_rest = part("// 出勤日結 V1", "// 按鈕控制")
attendance_utils = part("// 按鈕控制", "// 防止 HTML 注入")
escape_html = part("// 防止 HTML 注入")

modules = {
    "js/config.js": "// 系統設定\n" + config.split("\n", 1)[1],
    "js/app.js": "// 系統共用狀態與工具\n" + state + "\n" + escape_html,
    "js/api.js": "// Google Apps Script API 呼叫\n" + api,
    "js/attendance.js": "// 打卡、GPS 與主畫面狀態\n" + attendance_main + "\n" + attendance_utils,
    "js/daily-report.js": "// 每日回報與審核\n" + daily,
    "js/payroll.js": "// 薪資結算\n" + payroll,
    "js/admin-attendance.js": "// 管理後台：補卡、出勤審核、出勤日結\n" + admin_entry + "\n" + admin_rest,
    "js/auth.js": "// LINE / LIFF 初始化與 bootstrap\n" + auth,
}

Path("js").mkdir(exist_ok=True)
for path, content in modules.items():
    Path(path).write_text(content, encoding="utf-8")
    print(path, len(content.encode("utf-8")), "bytes")

fn_re = re.compile(r"\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(")
old_funcs = fn_re.findall(src)
combined = "\n".join(modules.values())
new_funcs = fn_re.findall(combined)

if sorted(old_funcs) != sorted(new_funcs):
    missing = sorted(set(old_funcs) - set(new_funcs))
    extra = sorted(set(new_funcs) - set(old_funcs))
    raise SystemExit(f"函式比對失敗 missing={missing} extra={extra}")
if len(old_funcs) != len(set(old_funcs)):
    raise SystemExit("原程式存在重複 named function，停止")
if len(new_funcs) != len(set(new_funcs)):
    raise SystemExit("拆分後存在重複 named function，停止")

index_path = Path("index.html")
html = index_path.read_text(encoding="utf-8")
old_tag = '<script src="js/legacy-app.js"></script>'
if old_tag not in html:
    raise SystemExit("index.html 找不到 legacy-app.js 引用，停止")

tags = """<script src=\"js/config.js\"></script>
  <script src=\"js/app.js\"></script>
  <script src=\"js/api.js\"></script>
  <script src=\"js/attendance.js\"></script>
  <script src=\"js/daily-report.js\"></script>
  <script src=\"js/payroll.js\"></script>
  <script src=\"js/admin-attendance.js\"></script>
  <script src=\"js/auth.js\"></script>"""
html = html.replace(old_tag, tags, 1)
index_path.write_text(html, encoding="utf-8")

required_refs = [
    "css/style.css", "js/config.js", "js/app.js", "js/api.js",
    "js/attendance.js", "js/daily-report.js", "js/payroll.js",
    "js/admin-attendance.js", "js/auth.js",
]
missing_refs = [x for x in required_refs if x not in html]
if missing_refs:
    raise SystemExit("index.html 缺少引用: " + ", ".join(missing_refs))
if "<style>" in html:
    raise SystemExit("index.html 仍包含 inline style")
if "<script>" in html:
    raise SystemExit("index.html 仍包含 inline script")

print("原 named functions:", len(old_funcs))
print("拆分後 named functions:", len(new_funcs))
print("index.html 已切換為模組載入")
