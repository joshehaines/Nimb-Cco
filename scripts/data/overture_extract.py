"""Extract an area from Overture Maps GeoParquet on S3 with HTTP range reads.

Only the row groups whose bbox statistics intersect the requested area are
downloaded, so a county-sized slice of a 70 GB theme costs a few hundred MB
of transfer. No AWS credentials or DuckDB extensions are needed.

Usage: python overture_extract.py <theme>/<type> <minlon> <minlat> <maxlon> <maxlat> <out.parquet>
Example: python overture_extract.py places/place -1.63 52.25 -1.49 52.36 places.parquet
Licence: places CDLA-Permissive-2.0; buildings, transportation, addresses ODbL (OpenStreetMap contributors and others).
"""
import sys, time, urllib.request, xml.etree.ElementTree as ET
import pyarrow as pa, pyarrow.parquet as pq, pyarrow.compute as pc
import fsspec

RELEASE = "2026-09-23.1"
BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com"


def list_keys(prefix):
    keys, token = [], None
    while True:
        url = f"{BUCKET}/?list-type=2&prefix={prefix}" + (f"&continuation-token={urllib.parse.quote(token)}" if token else "")
        xml = urllib.request.urlopen(url, timeout=60).read()
        root = ET.fromstring(xml)
        ns = {"s3": root.tag.split("}")[0].strip("{")}
        keys += [c.find("s3:Key", ns).text for c in root.findall("s3:Contents", ns)]
        if root.find("s3:IsTruncated", ns).text != "true":
            return keys
        token = root.find("s3:NextContinuationToken", ns).text


def main():
    theme_type, minlon, minlat, maxlon, maxlat, out = sys.argv[1:7]
    minlon, minlat, maxlon, maxlat = map(float, (minlon, minlat, maxlon, maxlat))
    theme, typ = theme_type.split("/")
    prefix = f"release/{RELEASE}/theme={theme}/type={typ}/"
    keys = list_keys(prefix)
    print(f"{len(keys)} files under {prefix}", flush=True)
    fs = fsspec.filesystem("http", client_kwargs={"trust_env": True}, block_size=4 * 1024 * 1024)
    tables, t0 = [], time.time()
    for i, key in enumerate(keys):
        url = f"{BUCKET}/{key}"
        try:
            with fs.open(url, "rb") as f:
                pf = pq.ParquetFile(f)
                schema_names = pf.schema_arrow.names
                bbox_idx = {}
                for j in range(pf.metadata.num_columns):
                    path = pf.metadata.schema.column(j).path
                    if path.startswith("bbox."):
                        bbox_idx[path.split(".")[1]] = j
                groups = []
                for g in range(pf.metadata.num_row_groups):
                    rg = pf.metadata.row_group(g)
                    sx = rg.column(bbox_idx["xmin"]).statistics
                    sy = rg.column(bbox_idx["ymin"]).statistics
                    ex = rg.column(bbox_idx["xmax"]).statistics
                    ey = rg.column(bbox_idx["ymax"]).statistics
                    if sx is None or not sx.has_min_max:
                        groups.append(g)
                        continue
                    if sx.min <= maxlon and ex.max >= minlon and sy.min <= maxlat and ey.max >= minlat:
                        groups.append(g)
                if not groups:
                    continue
                t = pf.read_row_groups(groups)
                b = t.column("bbox")
                mask = pc.and_(pc.and_(pc.less_equal(pc.struct_field(b, "xmin"), maxlon), pc.greater_equal(pc.struct_field(b, "xmax"), minlon)),
                               pc.and_(pc.less_equal(pc.struct_field(b, "ymin"), maxlat), pc.greater_equal(pc.struct_field(b, "ymax"), minlat)))
                t = t.filter(mask)
                if t.num_rows:
                    tables.append(t)
                print(f"[{i+1}/{len(keys)}] {key.split('/')[-1][:24]} groups={len(groups)} rows={t.num_rows} t={time.time()-t0:.0f}s", flush=True)
        except Exception as e:
            print(f"[{i+1}/{len(keys)}] ERROR {key}: {e}", flush=True)
    if not tables:
        print("no rows")
        return
    table = pa.concat_tables(tables, promote_options="default")
    pq.write_table(table, out, compression="zstd")
    print(f"wrote {out}: {table.num_rows} rows, {len(table.schema)} columns")


if __name__ == "__main__":
    import urllib.parse
    main()
