"""The cached real GOES crops (npz, from series.py) as raw float32 fields, so that node measures them with the same code as the model (irstats.mjs).
   python export_crops.py CROPS_DIR OUT_DIR   ->  OUT_DIR/<set>/<YYYYMMDDTHHMM>.f32 and OUT_DIR/index.json: [{set, name, n, res, lat, lon}]
"""
import sys, os, glob, json
import numpy as np

def main(src, dst):
    idx = []
    for d in sorted(glob.glob(os.path.join(src, '*'))):
        s = os.path.basename(d); os.makedirs(os.path.join(dst, s), exist_ok=True)
        for f in sorted(glob.glob(os.path.join(d, '*.npz'))):
            z = np.load(f); tb = z['tb'].astype(np.float32); name = os.path.basename(f)[:-4]
            tb.tofile(os.path.join(dst, s, name + '.f32'))
            idx.append({'set': s, 'name': name, 'n': int(tb.shape[0]), 'res': float(z['res']), 'lat': float(z['lat']), 'lon': float(z['lon'])})
    json.dump(idx, open(os.path.join(dst, 'index.json'), 'w'))
    print(len(idx), 'frames')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
