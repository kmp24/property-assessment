# 🚀 QUICKSTART - Shapefile to Dashboard in 10 Minutes

## What You Need

✅ Your property shapefile (`.shp` file)  
✅ GitHub account (free)  
✅ Python installed (or QGIS)  

## Step 1: Convert Shapefile (3 minutes)

### Method A: Python (Recommended)

```bash
# Install library
pip install geopandas

# Convert your shapefile
python convert_shapefile.py your_parcels.shp properties.geojson
```

**Output:**
```
Reading shapefile: your_parcels.shp
Found 8774 parcels
Converting to WGS84...
Calculating centroids...
✓ Conversion complete!
```

### Method B: QGIS (No Coding)

1. Open QGIS
2. Add your shapefile
3. Right-click → Export → Save As
4. Format: **GeoJSON**
5. CRS: **EPSG:4326**
6. Save as: `properties.geojson`

### Method C: Command Line

```bash
ogr2ogr -f GeoJSON -t_srs EPSG:4326 properties.geojson parcels.shp
```

---

## Step 2: Configure Field Mapping (2 minutes)

Open `app.js` in a text editor and find this section (around line 20):

```javascript
const FIELD_MAPPING = {
    parcelId: 'PARID',        // ← Change to YOUR field name
    address: 'SITEADDRESS',   // ← Change to YOUR field name
    owner: 'OWNERNAME1',      // ← Change to YOUR field name
    propertyType: 'PROPTYPE', // ← IMPORTANT: Must indicate type
    assessment2020: 'ASSESS2020',
    assessment2025: 'ASSESS2025',
    // ... rest of fields
};
```

**What to change:**
- Replace `'PARID'` with YOUR parcel ID field name
- Replace `'SITEADDRESS'` with YOUR address field name
- Replace field names to match YOUR shapefile

**How to find your field names:**
1. Open properties.geojson in text editor
2. Look at the "properties" section
3. Copy the exact field names

Example from your file:
```json
"properties": {
  "PARID": "R001",           ← This is your parcelId field
  "SITEADDRESS": "123 Main",  ← This is your address field
  "PROPTYPE": "Residential"   ← This is your propertyType field
}
```

---

## Step 3: Test Locally (1 minute)

1. Put these files in same folder:
   - `index.html`
   - `app.js`
   - `properties.geojson`

2. Open `index.html` in web browser

3. Open Console (F12) - should see:
```
✓ All libraries loaded
✓ Loaded 8774 properties
✓ Properties by type: residential: 8774, condo: 2535...
✓ Map initialized with 12453 markers
```

4. Check all 4 tabs work

---

## Step 4: Deploy to GitHub (4 minutes)

### Create Repository

1. Go to https://github.com/new
2. Name: `property-assessment`
3. Public
4. Create repository

### Upload Files

Click "uploading an existing file", then drag:
- ✅ `index.html`
- ✅ `app.js`
- ✅ `properties.geojson`
- ✅ `README.md`
- ✅ `.gitignore`

Click "Commit changes"

### Enable GitHub Pages

1. Click "Settings" tab
2. Click "Pages" (left sidebar)
3. Source: **main** branch
4. Click "Save"

### Visit Your Site!

Wait 2-3 minutes, then visit:
```
https://[your-username].github.io/property-assessment/
```

**Done!** 🎉

---

## Verification Checklist

After deploying, verify:

- [ ] All 4 tabs visible (Residential, Condo, Commercial, Vacant)
- [ ] Stats cards show correct totals
- [ ] Map displays with colored markers
- [ ] Click markers show property details
- [ ] Charts display data in all tabs
- [ ] No errors in console (F12)

---

## Common Issues & Fixes

### Issue: Properties.geojson not loading
**Fix:** Make sure all files in same directory
```
property-assessment/
  ├── index.html
  ├── app.js
  ├── properties.geojson  ← Must be here
  ├── README.md
```

### Issue: All properties showing as "Residential"
**Fix:** Check `propertyType` field in FIELD_MAPPING:

1. Open properties.geojson
2. Find field that indicates type (e.g., "PROPTYPE", "LANDUSE")
3. Update in app.js:
```javascript
propertyType: 'PROPTYPE',  // ← Your actual field name
```

### Issue: Map shows gray box, no markers
**Fix:** Shapefile not converted to WGS84

Re-convert with EPSG:4326:
```bash
python convert_shapefile.py your_parcels.shp properties.geojson
```

### Issue: Charts are empty
**Fix:** Field names don't match

1. Check your actual field names in properties.geojson
2. Update ALL fields in FIELD_MAPPING to match exactly

### Issue: File too large for GitHub (>100MB)
**Fix:** Simplify geometries:
```bash
npm install -g mapshaper
mapshaper properties.geojson -simplify 10% -o simplified.geojson
```

---

## Field Mapping Examples

### Example 1: Connecticut Assessor Data
```javascript
const FIELD_MAPPING = {
    parcelId: 'PARID',
    address: 'SITEADDRESS',
    owner: 'OWNERNAME1',
    propertyType: 'PROPTYPE',
    neighborhood: 'NBHD',
    designStyle: 'STYLE',
    acreage: 'ACRES',
    bedrooms: 'BEDRMS',
    bathrooms: 'BATHS',
    sqft: 'LBLDGAREA',
    yearBuilt: 'YRBLT',
    assessment2020: 'TOTVAL20',
    assessment2025: 'TOTVAL25'
};
```

### Example 2: Massachusetts Property Database
```javascript
const FIELD_MAPPING = {
    parcelId: 'LOC_ID',
    address: 'SITE_ADDR',
    owner: 'OWNER',
    propertyType: 'USE_CODE',
    acreage: 'LOT_SIZE',
    sqft: 'FIN_AREA',
    yearBuilt: 'YR_BUILT',
    assessment2020: 'FY20_VALUE',
    assessment2025: 'FY25_VALUE'
};
```

---

## Next Steps

After deployment:

### Immediate (Today)
- ✅ Share URL with team
- ✅ Gather feedback
- ✅ Fix any field mapping issues

### Short Term (This Week)
- ✅ Customize colors/branding
- ✅ Update text content
- ✅ Test with stakeholders

### Long Term (This Month)
- ✅ Add more features
- ✅ Connect to database for real-time updates
- ✅ Consider production hosting (Firebase, AWS)

---

## Git Authentication Fix

If you see: `Permission denied to kperham-lgtm/property-assessment.git`

**Fix:**
```powershell
# Option 1: Use GitHub CLI
gh auth login

# Option 2: Use Personal Access Token
# 1. Go to: https://github.com/settings/tokens
# 2. Generate new token
# 3. Use as password when pushing

git push -u origin main
Username: kperham-lgtm
Password: [paste your token]
```

---

## What Happens Automatically

Once deployed, the dashboard automatically:

✅ Loads your GeoJSON file  
✅ Categorizes properties by type  
✅ Calculates all statistics  
✅ Generates 10+ charts  
✅ Creates color-coded map  
✅ Builds interactive tooltips  

**You don't calculate anything!** Just upload your converted shapefile.

---

## Help & Documentation

📚 **SHAPEFILE-GUIDE.md** - Detailed conversion guide  
📖 **README.md** - Full feature list  
💻 **app.js** - Field mapping configuration  
🐍 **convert_shapefile.py** - Conversion script  

---

## The Bottom Line

**Time:** 10 minutes  
**Cost:** $0  
**Complexity:** Low  
**Result:** Professional dashboard  
**Savings:** $1,500 - $10,000/year vs ArcGIS  

**Let's go! 🚀**