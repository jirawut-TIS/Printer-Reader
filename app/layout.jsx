export const metadata = {
  title: "Printer Usage Reader",
  description: "อ่านค่าจาก HP Printer Report PDF",
};
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };
export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, padding: 0, background: "#f0f4f8" }}>{children}</body>
    </html>
  );
}
