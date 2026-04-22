import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

interface ScanOption {
  id: string;
  icon: keyof typeof Icons;
  title: string;
  description: string;
}

const scanOptions: ScanOption[] = [
  {
    id: "camera",
    icon: "camera",
    title: "Pill Scanner",
    description: "AI identifies pills by shape, color & imprint",
  },
  {
    id: "barcode",
    icon: "scan",
    title: "Barcode / QR",
    description: "Scan medication packaging",
  },
  {
    id: "ocr",
    icon: "fileText",
    title: "Label OCR",
    description: "Read prescription labels or blister packs",
  },
  {
    id: "manual",
    icon: "plus",
    title: "Manual Entry",
    description: "Enter medication details manually",
  },
];

interface AddMedicationOptionsProps {
  onSelect: (option: string) => void;
  className?: string;
}

export function AddMedicationOptions({ onSelect, className }: AddMedicationOptionsProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <h2 className="text-lg font-bold text-foreground">Add Medication</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Choose how you'd like to add your medication
      </p>
      
      <div className="grid gap-3">
        {scanOptions.map((option, index) => {
          const Icon = Icons[option.icon];
          
          return (
            <motion.div
              key={option.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                variant="interactive"
                className="cursor-pointer"
                onClick={() => onSelect(option.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{option.title}</h3>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </div>
                    <Icons.chevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export interface PillIdentificationResult {
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

interface CameraScanViewProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
  isProcessing?: boolean;
  className?: string;
}

export function CameraScanView({ onCapture, onClose, isProcessing, className }: CameraScanViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showUploadOption, setShowUploadOption] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      
      // Check if mediaDevices is available (requires HTTPS on mobile)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError("Camera access not available. This feature requires HTTPS or a secure connection.");
        setShowUploadOption(true);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (error) {
      console.error("Camera access error:", error);
      setShowUploadOption(true);
      
      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          setCameraError("Camera access denied. Please allow camera access or upload an image instead.");
        } else if (error.name === "NotFoundError") {
          setCameraError("No camera found on this device. You can upload an image instead.");
        } else if (error.name === "NotSupportedError" || error.name === "SecurityError") {
          setCameraError("Camera access requires a secure connection (HTTPS). Please upload an image instead.");
        } else {
          setCameraError("Could not access camera. Please try uploading an image instead.");
        }
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const captureImage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL("image/jpeg", 0.8);
    stopCamera();
    onCapture(imageData);
  }, [onCapture, stopCamera]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      onCapture(imageData);
    };
    reader.readAsDataURL(file);
  }, [onCapture]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  return (
    <div className={cn("relative", className)}>
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />

      <div className="relative aspect-square bg-foreground/5 rounded-2xl overflow-hidden">
        {cameraActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
            <div className="text-center p-6">
              {cameraError ? (
                <>
                  <Icons.alertTriangle className="w-16 h-16 mx-auto mb-4 text-warning" />
                  <p className="text-muted-foreground font-medium mb-4">{cameraError}</p>
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => fileInputRef.current?.click()}>
                      <Icons.upload className="w-4 h-4 mr-2" />
                      Upload Image
                    </Button>
                    <Button variant="outline" onClick={startCamera}>
                      Try Camera Again
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Icons.camera className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground font-medium mb-4">
                    Tap to start camera
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button onClick={startCamera}>
                      <Icons.camera className="w-4 h-4 mr-2" />
                      Start Camera
                    </Button>
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Icons.upload className="w-4 h-4 mr-2" />
                      Upload Image Instead
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-48 h-48">
              <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-primary rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-primary rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-primary rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-primary rounded-br-lg" />
              
              {isProcessing && (
                <motion.div
                  className="absolute left-0 right-0 h-1 bg-gradient-primary"
                  initial={{ top: 0 }}
                  animate={{ top: "100%" }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                />
              )}
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <div className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full mx-auto mb-4"
              />
              <p className="text-foreground font-medium">Analyzing pill...</p>
              <p className="text-sm text-muted-foreground">AI is identifying your medication</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 mt-6">
        <Button variant="ghost" size="icon-lg" onClick={handleClose}>
          <Icons.x className="w-6 h-6" />
        </Button>
        <Button
          size="xl"
          className="w-20 h-20 rounded-full"
          onClick={captureImage}
          disabled={isProcessing || !cameraActive}
        >
          <Icons.camera className="w-8 h-8" />
        </Button>
        <div className="w-14" />
      </div>

      <p className="text-center text-sm text-muted-foreground mt-4">
        {cameraActive 
          ? "Position pill in the frame and tap to capture" 
          : "Start the camera or upload an image to scan your pill"}
      </p>
    </div>
  );
}
