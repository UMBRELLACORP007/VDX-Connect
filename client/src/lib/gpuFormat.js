// Formats the raw { vendorId, deviceId, error } payload from
// system:get-gpu-info (main.js) / a peer's sysinfo broadcast into a
// readable label. Electron's app.getGPUInfo('basic') only ever hands back
// numeric PCI vendor/device ids — there's no model-name lookup available
// without a bundled PCI-ID database, so this maps the small, well-known set
// of vendor ids to a human name and leaves the device id as a hex code
// rather than guessing a marketing name that might be wrong.
const VENDOR_NAMES = {
  0x10de: 'NVIDIA',
  0x1002: 'AMD',
  0x1022: 'AMD',
  0x8086: 'Intel',
  0x106b: 'Apple',
  0x1414: 'Microsoft (Basic Render Driver)',
  0x5143: 'Qualcomm',
  0x13b5: 'ARM',
};

export function formatGpuInfo(gpu) {
  if (!gpu) return null;
  if (gpu.error) return null;
  if (gpu.vendorId == null && gpu.deviceId == null) return gpu.gpuName || null;

  const vendor = gpu.vendorId != null ? (VENDOR_NAMES[gpu.vendorId] || `Vendor 0x${gpu.vendorId.toString(16)}`) : 'Unknown vendor';
  const device = gpu.deviceId != null ? `0x${gpu.deviceId.toString(16)}` : null;
  return device ? `${vendor} (device ${device})` : vendor;
}
