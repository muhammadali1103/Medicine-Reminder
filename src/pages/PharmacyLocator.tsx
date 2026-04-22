import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BottomNav } from "@/components/BottomNav";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Pharmacy {
  id: string;
  name: string;
  address: string;
  distance: number;
  lat: number;
  lon: number;
  phone?: string;
  openingHours?: string;
}

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export default function PharmacyLocator() {
  const [searchQuery, setSearchQuery] = useState("");
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [filteredPharmacies, setFilteredPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  // Calculate distance between two coordinates in km
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Fetch pharmacies from Overpass API
  const fetchPharmacies = async (lat: number, lon: number) => {
    setLoading(true);
    try {
      const radius = 5000; // 5km radius
      const query = `
        [out:json][timeout:25];
        (
          node["amenity"="pharmacy"](around:${radius},${lat},${lon});
          way["amenity"="pharmacy"](around:${radius},${lat},${lon});
        );
        out body center;
      `;
      
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
      });
      
      if (!response.ok) throw new Error("Failed to fetch pharmacies");
      
      const data = await response.json();
      
      const pharmacyList: Pharmacy[] = data.elements.map((element: any, index: number) => {
        const elemLat = element.lat || element.center?.lat;
        const elemLon = element.lon || element.center?.lon;
        const distance = calculateDistance(lat, lon, elemLat, elemLon);
        
        return {
          id: element.id.toString(),
          name: element.tags?.name || `Pharmacy ${index + 1}`,
          address: element.tags?.["addr:street"] 
            ? `${element.tags?.["addr:housenumber"] || ""} ${element.tags?.["addr:street"]}`.trim()
            : "Address not available",
          distance,
          lat: elemLat,
          lon: elemLon,
          phone: element.tags?.phone || element.tags?.["contact:phone"],
          openingHours: element.tags?.opening_hours,
        };
      });
      
      // Sort by distance
      pharmacyList.sort((a, b) => a.distance - b.distance);
      
      setPharmacies(pharmacyList);
      setFilteredPharmacies(pharmacyList);
      
      if (pharmacyList.length === 0) {
        toast.info("No pharmacies found within 5km. Try a different area.");
      } else {
        toast.success(`Found ${pharmacyList.length} pharmacies nearby!`);
      }
    } catch (error) {
      console.error("Error fetching pharmacies:", error);
      toast.error("Failed to fetch pharmacies. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Initialize map
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current && userLocation) {
      mapRef.current = L.map(mapContainerRef.current).setView(
        [userLocation.lat, userLocation.lon],
        14
      );
      
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);
      
      // Add user marker
      const userIcon = L.divIcon({
        className: "user-location-marker",
        html: `<div style="width: 20px; height: 20px; background: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      
      L.marker([userLocation.lat, userLocation.lon], { icon: userIcon })
        .addTo(mapRef.current)
        .bindPopup("You are here");
    }
    
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [userLocation]);

  // Update pharmacy markers
  useEffect(() => {
    if (mapRef.current && filteredPharmacies.length > 0) {
      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      
      const pharmacyIcon = L.divIcon({
        className: "pharmacy-marker",
        html: `<div style="width: 30px; height: 30px; background: #22c55e; border: 2px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
          </svg>
        </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      
      filteredPharmacies.forEach(pharmacy => {
        const marker = L.marker([pharmacy.lat, pharmacy.lon], { icon: pharmacyIcon })
          .addTo(mapRef.current!)
          .bindPopup(`<strong>${pharmacy.name}</strong><br/>${pharmacy.address}`);
        markersRef.current.push(marker);
      });
    }
  }, [filteredPharmacies]);

  const requestLocation = () => {
    setLoading(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lon: longitude });
          setLocationEnabled(true);
          fetchPharmacies(latitude, longitude);
        },
        (error) => {
          console.error("Geolocation error:", error);
          toast.error("Unable to get your location. Please enable location services.");
          setLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      toast.error("Geolocation is not supported by your browser.");
      setLoading(false);
    }
  };

  // Filter pharmacies based on search
  useEffect(() => {
    if (searchQuery) {
      const filtered = pharmacies.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.address.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredPharmacies(filtered);
    } else {
      setFilteredPharmacies(pharmacies);
    }
  }, [searchQuery, pharmacies]);

  const openDirections = (pharmacy: Pharmacy) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${pharmacy.lat},${pharmacy.lon}`;
    window.open(url, "_blank");
  };

  const callPharmacy = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  const focusOnPharmacy = (pharmacy: Pharmacy) => {
    if (mapRef.current) {
      mapRef.current.setView([pharmacy.lat, pharmacy.lon], 16);
    }
  };

  const formatDistance = (km: number): string => {
    if (km < 1) {
      return `${Math.round(km * 1000)} m`;
    }
    return `${km.toFixed(1)} km`;
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      {/* Header */}
      <header className="bg-gradient-primary pt-8 pb-6 px-4">
        <div className="container">
          <h1 className="text-xl font-bold text-primary-foreground mb-4">
            Find a Pharmacy
          </h1>
          <div className="relative">
            <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-foreground/60" />
            <Input
              placeholder="Search pharmacies..."
              className="pl-10 bg-primary-foreground/20 border-primary-foreground/30 text-primary-foreground placeholder:text-primary-foreground/60"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </header>

      <main className="container px-4 mt-6">
        {/* Location Banner */}
        {!locationEnabled && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="mb-6 bg-accent border-accent-foreground/20">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Icons.mapPin className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">
                    Enable Location
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Find real pharmacies near you
                  </p>
                </div>
                <Button size="sm" onClick={requestLocation} disabled={loading}>
                  {loading ? "Loading..." : "Enable"}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Map */}
        {locationEnabled && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Card className="overflow-hidden">
              <div
                ref={mapContainerRef}
                className="w-full h-64 z-0"
                style={{ minHeight: "250px" }}
              />
            </Card>
          </motion.div>
        )}

        {/* Pharmacy List */}
        <div className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-muted-foreground">Searching for pharmacies...</p>
              </CardContent>
            </Card>
          ) : !locationEnabled ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Icons.mapPin className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-foreground mb-2">
                  Enable location to find pharmacies
                </p>
                <p className="text-sm text-muted-foreground">
                  We'll show you real pharmacies near your location
                </p>
              </CardContent>
            </Card>
          ) : filteredPharmacies.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Icons.mapPin className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-foreground mb-2">
                  No pharmacies found
                </p>
                <p className="text-sm text-muted-foreground">
                  Try a different search term or area
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredPharmacies.map((pharmacy, index) => (
              <motion.div
                key={pharmacy.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card 
                  className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => focusOnPharmacy(pharmacy)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground">
                            {pharmacy.name}
                          </h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {pharmacy.address}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-primary border-primary">
                          {formatDistance(pharmacy.distance)}
                        </Badge>
                      </div>
                    </div>

                    {pharmacy.openingHours && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                        <Icons.clock className="w-4 h-4" />
                        <span>{pharmacy.openingHours}</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {pharmacy.phone && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            callPharmacy(pharmacy.phone!);
                          }}
                        >
                          <Icons.phone className="w-4 h-4 mr-2" />
                          Call
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDirections(pharmacy);
                        }}
                      >
                        <Icons.mapPin className="w-4 h-4 mr-2" />
                        Directions
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
