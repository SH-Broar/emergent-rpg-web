import re, glob, os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.chdir(os.path.join(os.path.dirname(__file__), '..'))

KEEP_VILLAGE = {'npc-hako', 'npc-valencia'}   # 마을 영입 유지 (시작 약체 + 정령 예외)

files = sorted(glob.glob('public/data/npcs/act-1-*.txt'))
total_set = 0
for f in files:
    text = open(f, encoding='utf-8').read()
    # split keeping the [npc. headers
    parts = re.split(r'(?m)(^\[npc\.[^\]]+\]\n)', text)
    # parts: [pre, header1, body1, header2, body2, ...]
    out = [parts[0]]
    i = 1
    while i < len(parts):
        header = parts[i]
        body = parts[i + 1] if i + 1 < len(parts) else ''
        idm = re.match(r'^\[npc\.([^\]]+)\]', header)
        nid = idm.group(1) if idm else None
        is_companion = bool(re.search(r'(?m)^companion_kind\s*=', body)) or \
                       re.search(r'(?m)^recruit_enabled\s*=\s*true', body)
        already = re.search(r'(?m)^village_recruit\s*=', body)
        if nid and is_companion and nid not in KEEP_VILLAGE and not already:
            # insert village_recruit=false after recruit_enabled line if present, else after home_node
            m = re.search(r'(?m)^(recruit_enabled\s*=.*\n)', body)
            if m:
                idx = m.end()
                body = body[:idx] + 'village_recruit = false\n' + body[idx:]
            else:
                m2 = re.search(r'(?m)^(home_node\s*=.*\n)', body)
                if m2:
                    idx = m2.end()
                    body = body[:idx] + 'village_recruit = false\n' + body[idx:]
                else:
                    # fallback: after header
                    body = 'village_recruit = false\n' + body
            total_set += 1
        out.append(header)
        out.append(body)
        i += 2
    open(f, 'w', encoding='utf-8').write(''.join(out))

print("village_recruit=false set on", total_set, "NPCs")
# verify counts
allf = ''.join(open(f, encoding='utf-8').read() for f in files)
print("village_recruit=false lines now:", len(re.findall(r'(?m)^village_recruit\s*=\s*false', allf)))
