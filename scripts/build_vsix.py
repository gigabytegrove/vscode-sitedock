#!/usr/bin/env python3
"""Build a standards-compliant VS Code VSIX archive without running install scripts.

The extension uses the system npm CLI to install transport packages once into
VS Code global storage. No custom archive reader is packaged.
"""
from __future__ import annotations

import hashlib
import json
import mimetypes
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

APP_NS = 'http://schemas.microsoft.com/developer/vsx-schema/2011'
CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'
ET.register_namespace('', APP_NS)

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))

MIME_TYPES = {
    'vsixmanifest': 'text/xml',
    'json': 'application/json',
    'js': 'application/javascript',
    'mjs': 'application/javascript',
    'markdown': 'text/markdown',
    'html': 'text/html',
    'md': 'text/markdown',
    'png': 'image/png',
    'svg': 'image/svg+xml',
}
REQUIRED = ('package.json', 'README.md', 'LICENSE', 'src/extension.js', 'src/runtime.js', 'media/icon.png', 'src/connection.js')


def xml_bytes(element: ET.Element) -> bytes:
    return ET.tostring(element, encoding='utf-8', xml_declaration=True)


def create_manifest() -> bytes:
    # Align the VSIX metadata structure with Microsoft's published @vscode/vsce
    # toVsixManifest implementation. This is not a substitute for running vsce.
    manifest = ET.Element(f'{{{APP_NS}}}PackageManifest', {'Version': '2.0.0'})
    meta = ET.SubElement(manifest, f'{{{APP_NS}}}Metadata')
    ET.SubElement(meta, f'{{{APP_NS}}}Identity', {
        'Language': 'en-US',
        'Id': PACKAGE['name'],
        'Version': PACKAGE['version'],
        'Publisher': PACKAGE['publisher'],
    })
    ET.SubElement(meta, f'{{{APP_NS}}}DisplayName').text = PACKAGE['displayName']
    description = ET.SubElement(meta, f'{{{APP_NS}}}Description')
    description.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    description.text = PACKAGE['description']
    ET.SubElement(meta, f'{{{APP_NS}}}Tags').text = ','.join(PACKAGE.get('keywords', []))
    ET.SubElement(meta, f'{{{APP_NS}}}Categories').text = ','.join(PACKAGE.get('categories', []))
    ET.SubElement(meta, f'{{{APP_NS}}}GalleryFlags').text = 'Public'
    props = ET.SubElement(meta, f'{{{APP_NS}}}Properties')
    prop_values = (
        ('Microsoft.VisualStudio.Code.Engine', PACKAGE['engines']['vscode']),
        ('Microsoft.VisualStudio.Code.ExtensionDependencies', ','.join(PACKAGE.get('extensionDependencies', []))),
        ('Microsoft.VisualStudio.Code.ExtensionPack', ','.join(PACKAGE.get('extensionPack', []))),
        ('Microsoft.VisualStudio.Code.ExtensionKind', ','.join(PACKAGE.get('extensionKind', []))),
        ('Microsoft.VisualStudio.Code.LocalizedLanguages', ''),
        ('Microsoft.VisualStudio.Code.EnabledApiProposals', ','.join(PACKAGE.get('enabledApiProposals', []))),
        ('Microsoft.VisualStudio.Code.ExecutesCode', 'true'),
        ('Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown', 'true'),
        ('Microsoft.VisualStudio.Services.Content.Pricing', PACKAGE.get('pricing', 'Free')),
    )
    for ident, value in prop_values:
        ET.SubElement(props, f'{{{APP_NS}}}Property', {'Id': ident, 'Value': value})
    ET.SubElement(meta, f'{{{APP_NS}}}License').text = 'extension/LICENSE'
    ET.SubElement(meta, f'{{{APP_NS}}}Icon').text = 'extension/' + PACKAGE['icon']
    install = ET.SubElement(manifest, f'{{{APP_NS}}}Installation')
    ET.SubElement(install, f'{{{APP_NS}}}InstallationTarget', {'Id': 'Microsoft.VisualStudio.Code'})
    ET.SubElement(manifest, f'{{{APP_NS}}}Dependencies')
    assets = ET.SubElement(manifest, f'{{{APP_NS}}}Assets')
    for asset_type, file in (
        ('Microsoft.VisualStudio.Code.Manifest', 'package.json'),
        ('Microsoft.VisualStudio.Services.Icons.Default', 'media/icon.png'),
        ('Microsoft.VisualStudio.Services.Content.Details', 'README.md'),
        ('Microsoft.VisualStudio.Services.Content.License', 'LICENSE'),
    ):
        ET.SubElement(assets, f'{{{APP_NS}}}Asset', {
            'Type': asset_type,
            'Path': 'extension/' + file,
            'Addressable': 'true',
        })
    return xml_bytes(manifest)


def source_files() -> list[Path]:
    files = [ROOT / s for s in ('package.json', 'README.md', 'LICENSE')]
    for folder in ('src', 'media', 'ui'):
        files.extend(sorted(p for p in (ROOT/folder).rglob('*') if p.is_file()))
    for f in files:
        if not f.is_file() or f.is_symlink():
            raise ValueError(f'Missing or unsafe source file: {f}')
    return files


def content_types(files: list[Path]) -> bytes:
    types = ET.Element(f'{{{CT_NS}}}Types')
    # XML namespace is intentionally emitted on the root, not as an empty extension.
    for extension, mime in sorted(MIME_TYPES.items()):
        ET.SubElement(types, f'{{{CT_NS}}}Default', {'Extension':extension, 'ContentType':mime})
    for f in files:
        relative = f.relative_to(ROOT).as_posix()
        if not f.suffix:
            ET.SubElement(types, f'{{{CT_NS}}}Override', {
                'PartName':'/extension/'+relative, 'ContentType':'text/plain',
            })
        elif f.suffix.lstrip('.') not in MIME_TYPES:
            raise ValueError(f'Unmapped VSIX content type for {relative}')
    return xml_bytes(types)


def verify_vsix(archive: Path) -> None:
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            raise ValueError('VSIX contains an invalid ZIP member')
        names = z.namelist()
        if len(names) != len(set(names)):
            raise ValueError('VSIX has duplicate ZIP members')
        if not {'[Content_Types].xml','extension.vsixmanifest','extension/package.json'}.issubset(names):
            raise ValueError('Missing critical VSIX member')
        ns = {'ct':CT_NS,'vs':APP_NS}
        types=ET.fromstring(z.read('[Content_Types].xml'))
        ext_map = {}
        for d in types.findall('ct:Default',ns):
            ext=d.attrib.get('Extension','')
            if not ext:
                raise ValueError('Invalid empty VSIX content-type Extension attribute')
            if ext in ext_map:
                raise ValueError('Duplicate VSIX content-type extension')
            ext_map[ext]=d.attrib['ContentType']
        overridden={e.attrib['PartName'].lstrip('/'):e.attrib['ContentType'] for e in types.findall('ct:Override',ns)}
        for name in names:
            if name == '[Content_Types].xml':
                continue
            if name not in overridden and name.rsplit('.',1)[-1] not in ext_map:
                raise ValueError(f'No content type declared for {name}')
        pkg_engine=json.loads(z.read('extension/package.json'))['engines']['vscode']
        manifest=ET.fromstring(z.read('extension.vsixmanifest'))
        identity=manifest.find('vs:Metadata/vs:Identity',ns)
        if identity is None or identity.attrib['Version']!=PACKAGE['version']:
            raise ValueError('Manifest version mismatches package')
        targets=manifest.findall('vs:Installation/vs:InstallationTarget',ns)
        if len(targets)!=1 or targets[0].attrib['Id']!='Microsoft.VisualStudio.Code':
            raise ValueError('VSIX target is not VS Code')
        flags=manifest.find('vs:Metadata/vs:GalleryFlags',ns)
        if flags is None or flags.text!='Public':
            raise ValueError('Missing Public Marketplace gallery flag')
        props={p.attrib['Id']:p.attrib.get('Value') for p in manifest.findall('vs:Metadata/vs:Properties/vs:Property',ns)}
        if props.get('Microsoft.VisualStudio.Code.Engine') != pkg_engine:
            raise ValueError('Missing/mismatched Marketplace engine property')
        if props.get('Microsoft.VisualStudio.Services.Content.Pricing') != 'Free':
            raise ValueError('Missing free-pricing Marketplace property')
        for asset in manifest.findall('vs:Assets/vs:Asset',ns):
            if asset.attrib['Path'] not in names:
                raise ValueError(f'VSIX asset missing: {asset.attrib["Path"]}')
        pkg=json.loads(z.read('extension/package.json'))
        if pkg['version']!=identity.attrib['Version']:
            raise ValueError('Embedded package metadata mismatches manifest')
        if 'extension/'+pkg['main'].removeprefix('./') not in names:
            raise ValueError('VSIX main entry point is missing')
        for f in REQUIRED:
            if 'extension/'+f not in names:
                raise ValueError(f'Missing required source: {f}')


def main():
    files=source_files()
    target=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT / (f"{PACKAGE['name']}-{PACKAGE['version']}.vsix")
    target.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(target, mode='w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr('[Content_Types].xml',content_types(files))
        z.writestr('extension.vsixmanifest',create_manifest())
        for f in files:
            z.write(f, 'extension/'+f.relative_to(ROOT).as_posix())
    verify_vsix(target)
    print(f'VALID VSIX: {target}')
    print(f'SIZE: {target.stat().st_size} bytes')
    print(f'SHA256: {hashlib.sha256(target.read_bytes()).hexdigest()}')


if __name__=='__main__':
    main()
