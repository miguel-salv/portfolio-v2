"""Embed production provenance in WebP XMP without changing image pixels.

The Impeccable helper writes a sidecar for WebP; webpmux carries the same
production description inside the RIFF container so provenance survives copies.
"""
from pathlib import Path
import json,subprocess,tempfile,xml.etree.ElementTree as ET


def embed(path):
    path=Path(path);sidecar=path.with_suffix(path.suffix+'.json')
    if not sidecar.exists():return False
    data=json.loads(sidecar.read_text());origin=data.get('origin') or data.get('prompt')
    if not origin:return False
    ns={'x':'adobe:ns:meta/','rdf':'http://www.w3.org/1999/02/22-rdf-syntax-ns#','dc':'http://purl.org/dc/elements/1.1/','xmp':'http://ns.adobe.com/xap/1.0/'}
    for key,url in ns.items():ET.register_namespace(key,url)
    root=ET.Element('{'+ns['x']+'}xmpmeta');rdf=ET.SubElement(root,'{'+ns['rdf']+'}RDF');description=ET.SubElement(rdf,'{'+ns['rdf']+'}Description',{'{'+ns['rdf']+'}about':''})
    paragraph=ET.SubElement(description,'{'+ns['dc']+'}description');alternate=ET.SubElement(paragraph,'{'+ns['rdf']+'}Alt');line=ET.SubElement(alternate,'{'+ns['rdf']+'}li',{'{http://www.w3.org/XML/1998/namespace}lang':'x-default'});line.text=origin
    creator=ET.SubElement(description,'{'+ns['xmp']+'}CreatorTool');creator.text='Blender Cycles / reproducible portfolio workbench renderer'
    if data.get('source'):
        source=ET.SubElement(description,'{'+ns['dc']+'}source');source.text=data['source']
    with tempfile.TemporaryDirectory(prefix='workbench-xmp-') as directory:
        xmp=Path(directory)/'provenance.xmp';xmp.write_bytes(ET.tostring(root,encoding='utf-8',xml_declaration=True))
        result=Path(directory)/'embedded.webp'
        subprocess.run(['/opt/homebrew/bin/webpmux','-set','xmp',str(xmp),str(path),'-o',str(result)],check=True,capture_output=True)
        path.write_bytes(result.read_bytes())
    data['metadataEmbedded']='XMP';sidecar.write_text(json.dumps(data,indent=2)+'\n');return True


if __name__=='__main__':
    import sys
    count=sum(embed(path) for item in sys.argv[1:] for path in ([Path(item)] if Path(item).is_file() else Path(item).glob('*.webp')))
    print('Embedded production provenance in',count,'WebP assets.')
