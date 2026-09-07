import os
import glob
import re
import json

import scripts.data_dnb_dubstep
import scripts.data_trap_ukbass
import scripts.data_house_techno
import scripts.data_trance_hard
import scripts.data_future_hiphop
import scripts.data_latin_pop
import scripts.data_rock_jazz

all_patterns = {}
for mod in [scripts.data_dnb_dubstep, scripts.data_trap_ukbass, scripts.data_house_techno,
            scripts.data_trance_hard, scripts.data_future_hiphop, scripts.data_latin_pop,
            scripts.data_rock_jazz]:
    all_patterns.update(mod.PATTERNS)

def format_pattern(pattern):
    # Format pattern as indented json
    dumped = json.dumps(pattern, indent=6)
    lines = dumped.splitlines()
    # first line is '{', indented 4 spaces
    # middle lines indented 6 spaces
    # last line is '}', indented 4 spaces
    formatted_lines = [lines[0]]
    for l in lines[1:-1]:
        formatted_lines.append(l)
    formatted_lines.append(lines[-1])
    return '\n'.join(formatted_lines)

files = sorted(glob.glob('src/data/genres/*.ts'))
total_replaced = 0

for filepath in files:
    if 'index.ts' in filepath:
        continue
    content = open(filepath, 'r', encoding='utf-8').read()
    
    # Locate each genre and its sequencer_pattern
    pos = 0
    new_content_parts = []
    
    while True:
        m = re.search(r'\"id\":\s*\"([^\"]+)\"[\s\S]*?\"sequencer_pattern\":\s*\{', content[pos:])
        if not m:
            new_content_parts.append(content[pos:])
            break
        
        gid = m.group(1)
        start_pattern = pos + m.end() - 1 # The opening '{'
        
        # Add everything up to the opening '{'
        new_content_parts.append(content[pos:start_pattern])
        
        # Find matching '}'
        depth = 0
        end_pattern = start_pattern
        for i in range(start_pattern, len(content)):
            if content[i] == '{':
                depth += 1
            elif content[i] == '}':
                depth -= 1
                if depth == 0:
                    end_pattern = i + 1
                    break
        
        if gid not in all_patterns:
            print(f"ERROR: {gid} not in patterns!")
            new_content_parts.append(content[start_pattern:end_pattern])
        else:
            pat = all_patterns[gid]
            # Replace pattern block
            formatted = format_pattern(pat)
            new_content_parts.append(formatted)
            total_replaced += 1
        
        pos = end_pattern

    new_content = ''.join(new_content_parts)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Updated {filepath}")

print(f"Successfully replaced sequencer_pattern for {total_replaced} genres.")
