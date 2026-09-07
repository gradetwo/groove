import glob, re, json
from scripts.generate_real_radar import compute_radar

files = sorted(glob.glob("src/data/genres/*.ts"))
updated_genres = 0

for f in files:
    if f.endswith("index.ts"):
        continue
        
    content = open(f, "r", encoding="utf-8").read()
    
    # Parse JSON array
    match = re.search(r"export\s+const\s+\w+\s*:\s*Genre\[\]\s*=\s*(\[.*\]);?\s*$", content, re.DOTALL)
    if not match:
        print(f"Skipping {f}: no array match")
        continue
        
    genres_array = json.loads(match.group(1))
    
    for g in genres_array:
        gid = g["id"]
        new_radar = compute_radar(g)
        g["radar_metrics"] = new_radar
        updated_genres += 1
        
    # Re-serialize genres array with clean formatting (2-space indent like original)
    new_json_str = json.dumps(genres_array, ensure_ascii=False, indent=2)
    
    # Re-construct TS file content
    # Find variable name: export const HOUSE_GENRES: Genre[] = [ ... ];
    prefix_match = re.search(r"^(.*?export\s+const\s+\w+\s*:\s*Genre\[\]\s*=\s*)", content, re.DOTALL)
    if not prefix_match:
        print(f"Error finding prefix in {f}")
        continue
        
    prefix = prefix_match.group(1)
    new_content = prefix + new_json_str + ";\n"
    
    with open(f, "w", encoding="utf-8") as out_file:
        out_file.write(new_content)
        
    print(f"Updated {f} with {len(genres_array)} genres.")

print(f"Finished: updated radar metrics for {updated_genres} genres across all files.")
