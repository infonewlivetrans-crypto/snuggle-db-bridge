// Лёгкий графический QR-код (mock). Использует библиотеку 'qrcode' и рендерит SVG.
// Никаких внешних сетевых запросов; secrets не передаются. Всегда сопровождается пометкой «Тестовый QR».
import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  value: string;
  size?: number;
  className?: string;
}

export function QrCodeMockVisual({ value, size = 220, className }: Props) {
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: size,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(s => {
        if (!cancelled) setSvg(s);
      })
      .catch(() => {
        if (!cancelled) setSvg("");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      // svg построен библиотекой локально из переданной строки — безопасно
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label="QR-код (тестовый)"
    />
  );
}
