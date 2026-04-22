import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, Result, BarcodeFormat, DecodeHintType } from "@zxing/library";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { toast } from "sonner";

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");

  const startScanning = useCallback(async (deviceId?: string) => {
    if (!videoRef.current) return;

    setScanning(true);
    setError(null);

    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.DATA_MATRIX,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints);
      readerRef.current = reader;

      // Get available video devices
      const videoDevices = await reader.listVideoInputDevices();
      setDevices(videoDevices);

      // Prefer back camera
      let targetDeviceId = deviceId;
      if (!targetDeviceId && videoDevices.length > 0) {
        const backCamera = videoDevices.find(
          (device) =>
            device.label.toLowerCase().includes("back") ||
            device.label.toLowerCase().includes("rear") ||
            device.label.toLowerCase().includes("environment")
        );
        targetDeviceId = backCamera?.deviceId || videoDevices[0].deviceId;
        setSelectedDevice(targetDeviceId);
      }

      await reader.decodeFromVideoDevice(
        targetDeviceId || undefined,
        videoRef.current,
        (result: Result | null, err?: Error) => {
          if (result) {
            const text = result.getText();
            console.log("Scanned:", text);
            toast.success("Code scanned successfully!");
            stopScanning();
            onScan(text);
          }
          if (err && !(err.message.includes("No MultiFormat Readers"))) {
            // Ignore continuous scanning errors
          }
        }
      );
    } catch (err: any) {
      console.error("Scanner error:", err);
      setError(err.message || "Failed to start camera");
      toast.error("Could not access camera. Please check permissions.");
      setScanning(false);
    }
  }, [onScan]);

  const stopScanning = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset();
      readerRef.current = null;
    }
    setScanning(false);
  }, []);

  const switchCamera = (deviceId: string) => {
    stopScanning();
    setSelectedDevice(deviceId);
    setTimeout(() => startScanning(deviceId), 100);
  };

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background/95 z-50 flex flex-col"
    >
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => { stopScanning(); onClose(); }}>
          <Icons.x className="w-6 h-6" />
        </Button>
        <h2 className="text-lg font-semibold text-foreground">Scan Barcode/QR</h2>
        <div className="w-10" />
      </header>

      {/* Scanner View */}
      <div className="flex-1 p-4 flex flex-col">
        <Card className="flex-1 overflow-hidden relative">
          <CardContent className="p-0 h-full flex items-center justify-center bg-black">
            {!scanning && !error && (
              <div className="text-center p-8">
                <Icons.qrCode className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  Scan a barcode or QR code on your medication
                </p>
                <Button onClick={() => startScanning()}>
                  <Icons.camera className="w-4 h-4 mr-2" />
                  Start Scanner
                </Button>
              </div>
            )}

            {error && (
              <div className="text-center p-8">
                <Icons.warning className="w-16 h-16 mx-auto text-destructive mb-4" />
                <p className="text-destructive font-medium mb-2">Camera Error</p>
                <p className="text-muted-foreground text-sm mb-4">{error}</p>
                <Button onClick={() => startScanning()}>
                  <Icons.refresh className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
              </div>
            )}

            <video
              ref={videoRef}
              className={`w-full h-full object-cover ${!scanning ? 'hidden' : ''}`}
              playsInline
              muted
            />

            {/* Scanning overlay */}
            {scanning && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-64 border-2 border-primary rounded-lg relative">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-lg" />
                    <motion.div
                      className="absolute left-0 right-0 h-0.5 bg-primary"
                      animate={{ top: ["10%", "90%", "10%"] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Camera switcher */}
        {scanning && devices.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {devices.map((device) => (
              <Button
                key={device.deviceId}
                variant={selectedDevice === device.deviceId ? "default" : "outline"}
                size="sm"
                onClick={() => switchCamera(device.deviceId)}
                className="flex-shrink-0"
              >
                {device.label || `Camera ${devices.indexOf(device) + 1}`}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-border">
        {scanning && (
          <Button variant="outline" className="w-full" onClick={stopScanning}>
            <Icons.x className="w-4 h-4 mr-2" />
            Stop Scanning
          </Button>
        )}
      </div>

      {/* Tips */}
      <div className="p-4 bg-accent/50">
        <p className="text-xs text-muted-foreground text-center">
          <strong>Tips:</strong> Hold your device steady and ensure the code is within the frame. Good lighting helps!
        </p>
      </div>
    </motion.div>
  );
}