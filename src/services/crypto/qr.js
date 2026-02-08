import QRCode from "qrcode";

export async function generateQrCode(text) {
  return await QRCode.toDataURL(text);
}
