"""
Convert GeoParquet to PMTiles v3 (compatible with pmtiles.js 3.0.7)

This version ensures compatibility with the PMTiles JavaScript library.

Requirements:
    pip install geopandas pyarrow
    tippecanoe (latest version from https://github.com/felt/tippecanoe)

Usage:
    python convert_to_pmtiles_v3.py
"""

import geopandas as gpd
import subprocess
import os

print("📦 Loading parquet file...")
gdf = gpd.read_parquet('/mnt/c/Users/kperham/work/property-assessment/parcels.parquet')

print(f"✓ Loaded {len(gdf):,} parcels")
print(f"✓ CRS: {gdf.crs}")

# Ensure WGS84
if gdf.crs != 'EPSG:4326':
    print("→ Converting to EPSG:4326...")
    gdf = gdf.to_crs('EPSG:4326')

# Rename propertyType to "Property Type" (with space) for dashboard compatibility
if 'propertyType' in gdf.columns:
    gdf = gdf.rename(columns={'propertyType': 'Property Type'})
    print("✓ Renamed propertyType → Property Type")

# Columns to keep
columns_to_keep = [
    'Parcel ID',
    'Property Address', 
    'Owner',
    'Property Type',  # Changed from propertyType
    'Neighborhood',
    'Style Description',
    'Land Acres',
    'Number of Bedroom',
    'Number of Bathrooms',
    'Zone',
    'Frame Type',
    'Gross Area of Primary Building',
    'Effective Year Built',
    'Pre Year Assessed Total',
    'Assessed Total',
    'State Use Description',
    'geometry'
]

# Keep existing columns
existing_cols = [col for col in columns_to_keep if col in gdf.columns]
gdf_slim = gdf[existing_cols].copy()

print(f"→ Keeping {len(existing_cols)} columns")
print(f"  Columns: {', '.join(existing_cols[:5])}...")

# Export to GeoJSON
print("→ Exporting to GeoJSON...")
gdf_slim.to_file('parcels_temp.geojson', driver='GeoJSON')

print("→ Creating PMTiles with tippecanoe...")

# Optimized tippecanoe command for PMTiles v3
tippecanoe_cmd = [
    'tippecanoe',
    '-o', '/mnt/c/Users/kperham/work/property-assessment/parcels.pmtiles',
    '-Z', '10',                          # Min zoom
    '-z', '16',                          # Max zoom (reduced for better performance)
    '-l', 'parcels',                     # Layer name (MUST match app.js)
    '--drop-densest-as-needed',          # Simplify at low zooms
    '--force',                           # Overwrite
    '--no-tile-compression',             # IMPORTANT: Disable compression for better compatibility
    '--hilbert',                         # Better spatial clustering
    '--simplification=10',               # Simplify complex geometries
    'parcels_temp.geojson'
]

try:
    print(f"  Command: {' '.join(tippecanoe_cmd)}")
    result = subprocess.run(tippecanoe_cmd, check=True, capture_output=True, text=True)
    print("✓ PMTiles created!")
    
    # Show tippecanoe output
    if result.stdout:
        print(result.stdout)
    
    # Clean up
    os.remove('parcels_temp.geojson')
    print("✓ Cleaned up temp files")
    
    # File info
    size_mb = os.path.getsize('/mnt/c/Users/kperham/work/property-assessment/parcels.pmtiles') / (1024 * 1024)
    print(f"\n✓ Final file: parcels.pmtiles ({size_mb:.1f} MB)")
    
    # Verify it's a valid PMTiles file
    with open('/mnt/c/Users/kperham/work/property-assessment/parcels.pmtiles', 'rb') as f:
        header = f.read(7)
        if header == b'PMTiles':
            print("✓ Valid PMTiles v3 header confirmed")
        else:
            print(f"⚠ Warning: Header is {header}, expected b'PMTiles'")
    
    print("\n🎉 Success! Deploy these files:")
    print("   - parcels.pmtiles")
    print("   - index.html")
    print("   - app.js")
    print("   - libs/ folder")
    
except subprocess.CalledProcessError as e:
    print(f"\n❌ Tippecanoe error:")
    print(e.stderr if e.stderr else e.stdout)
    print("\nTroubleshooting:")
    print("1. Check tippecanoe version: tippecanoe --version")
    print("   (Need version 2.x or higher)")
    print("2. Try: brew upgrade tippecanoe (macOS)")
    print("3. Or reinstall from: https://github.com/felt/tippecanoe")
    
except FileNotFoundError:
    print("❌ tippecanoe not found!")
    print("\nInstall:")
    print("  macOS: brew install tippecanoe")
    print("  Linux: https://github.com/felt/tippecanoe#installation")
    print("  Windows: Use WSL with brew or Docker")
