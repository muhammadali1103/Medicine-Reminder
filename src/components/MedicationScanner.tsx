import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";

interface ScanResult {
  identified: boolean;
  confidence: number;
  medication: {
    name: string | null;
    genericName: string | null;
    strength: string | null;
    manufacturer: string | null;
  };
  characteristics: {
    shape: string;
    primaryColor: string;
    secondaryColor: string | null;
    imprint: string | null;
    size: string;
    features: string[];
  };
  warnings: string[];
  requiresManualVerification: boolean;
}

interface MedicationScannerProps {
  onScanComplete: (result: ScanResult) => void;
  onClose: () => void;
}

export function MedicationScanner({ onScanComplete, onClose }: MedicationScannerProps) {
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [scanning, setScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      toast.error("Could not access camera. Please use file upload instead.");
      setMode("upload");
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL("image/jpeg", 0.8);
      setCapturedImage(imageData);
      stopCamera();
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setCapturedImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async () => {
    if (!capturedImage) return;

    setScanning(true);
    try {
      const { data, error } = await apiClient.functions.invoke("pill-identify", {
        body: { imageBase64: capturedImage },
      });

      if (error) {
        console.error("Error analyzing image:", error);
        toast.error("Failed to analyze image. Please try again.");
        setScanning(false);
        return;
      }

      if (data?.success && data?.data) {
        const result = data.data as ScanResult;
        
        if (result.identified && result.confidence >= 70) {
          toast.success(`Identified: ${result.medication.name || "Unknown medication"}`);
          onScanComplete(result);
        } else {
          toast.warning("Could not confidently identify the medication. Please verify manually.");
          onScanComplete(result);
        }
      } else {
        toast.error(data?.error || "Could not analyze image");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred while analyzing the image");
    }
    setScanning(false);
  };

  const retake = () => {
    setCapturedImage(null);
    if (mode === "camera") {
      startCamera();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background/95 z-50 flex flex-col"
    >
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => { stopCamera(); onClose(); }}>
          <Icons.x className="w-6 h-6" />
        </Button>
        <h2 className="text-lg font-semibold text-foreground">Scan Medication</h2>
        <div className="w-10" />
      </header>

      {/* Mode Toggle */}
      <div className="flex gap-2 p-4">
        <Button
          variant={mode === "camera" ? "default" : "outline"}
          className="flex-1"
          onClick={() => { setMode("camera"); setCapturedImage(null); }}
        >
          <Icons.camera className="w-4 h-4 mr-2" />
          Camera
        </Button>
        <Button
          variant={mode === "upload" ? "default" : "outline"}
          className="flex-1"
          onClick={() => { setMode("upload"); stopCamera(); setCapturedImage(null); }}
        >
          <Icons.fileText className="w-4 h-4 mr-2" />
          Upload
        </Button>
      </div>

      {/* Camera/Image View */}
      <div className="flex-1 p-4 flex flex-col">
        {!capturedImage ? (
          <Card className="flex-1 overflow-hidden">
            <CardContent className="p-0 h-full flex items-center justify-center bg-muted">
              {mode === "camera" ? (
                cameraActive ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center p-8">
                    <Icons.camera className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      Position your pill or prescription label in the frame
                    </p>
                    <Button onClick={startCamera}>
                      <Icons.camera className="w-4 h-4 mr-2" />
                      Start Camera
                    </Button>
                  </div>
                )
              ) : (
                <div className="text-center p-8">
                  <Icons.fileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Upload an image of your pill or prescription label
                  </p>
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <Icons.plus className="w-4 h-4 mr-2" />
                    Choose File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="flex-1 overflow-hidden">
            <CardContent className="p-0 h-full relative">
              <img
                src={capturedImage}
                alt="Captured medication"
                className="w-full h-full object-contain"
              />
              {scanning && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-foreground font-medium">Analyzing image...</p>
                    <p className="text-sm text-muted-foreground">This may take a few seconds</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-border space-y-3">
        {!capturedImage && cameraActive && (
          <Button className="w-full" size="lg" onClick={capturePhoto}>
            <Icons.camera className="w-5 h-5 mr-2" />
            Capture Photo
          </Button>
        )}

        {capturedImage && !scanning && (
          <>
            <Button className="w-full" size="lg" onClick={analyzeImage}>
              <Icons.scan className="w-5 h-5 mr-2" />
              Analyze Medication
            </Button>
            <Button variant="outline" className="w-full" onClick={retake}>
              Retake Photo
            </Button>
          </>
        )}
      </div>

      {/* Tips */}
      <div className="p-4 bg-accent/50">
        <p className="text-xs text-muted-foreground text-center">
          <strong>Tips:</strong> Ensure good lighting, focus on the pill or label, and capture any imprints or markings clearly.
        </p>
      </div>
    </motion.div>
  );
}
