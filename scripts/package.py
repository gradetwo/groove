import os
import zipfile
import tarfile

RELEASE_DIR = 'release'
DIST_DIR = 'dist'

os.makedirs(RELEASE_DIR, exist_ok=True)

# 1. Create groove-release.zip (dist/ folder prefix)
zip_with_dist = os.path.join(RELEASE_DIR, 'groove-release.zip')
with zipfile.ZipFile(zip_with_dist, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(DIST_DIR):
        for file in files:
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, start='.')
            zipf.write(file_path, arcname)

# 2. Create dist.zip (root contents of dist directly)
zip_root = os.path.join(RELEASE_DIR, 'dist.zip')
with zipfile.ZipFile(zip_root, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(DIST_DIR):
        for file in files:
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, start=DIST_DIR)
            zipf.write(file_path, arcname)

# 3. Create groove-release.tar.gz
tar_path = os.path.join(RELEASE_DIR, 'groove-release.tar.gz')
with tarfile.open(tar_path, 'w:gz') as tar:
    tar.add(DIST_DIR, arcname=DIST_DIR)

print(f"Packaged successfully:")
for name in ['groove-release.zip', 'dist.zip', 'groove-release.tar.gz']:
    p = os.path.join(RELEASE_DIR, name)
    size_kb = os.path.getsize(p) / 1024
    print(f" - {p}: {size_kb:.1f} KB")
