"use client"

import { MapContainer, TileLayer, Polyline, Popup } from "react-leaflet"
import "leaflet/dist/leaflet.css"

type PublicRoute = {
  name: string
  color: string
  positions: [number, number][]
}

// Mock public itineraries — replaced with real API data in M7
const MOCK_ROUTES: PublicRoute[] = [
  {
    name: "Cinque Terre — 4 days",
    color: "#0ea5e9",
    positions: [
      [44.1053, 9.7289],
      [44.1272, 9.7172],
      [44.1461, 9.6814],
      [44.1558, 9.6503],
      [44.1675, 9.6396],
    ],
  },
  {
    name: "Gulf of Orosei — 5 days",
    color: "#10b981",
    positions: [
      [40.1667, 9.75],
      [40.1333, 9.7333],
      [40.1, 9.7167],
      [40.0667, 9.7],
      [40.05, 9.6833],
    ],
  },
  {
    name: "Kornati Islands — 6 days",
    color: "#f59e0b",
    positions: [
      [43.8333, 15.3167],
      [43.8, 15.35],
      [43.7667, 15.3833],
      [43.7333, 15.4167],
      [43.7, 15.45],
      [43.6667, 15.4833],
    ],
  },
]

export default function PublicMap() {
  return (
    <MapContainer
      center={[43, 13]}
      zoom={6}
      className="w-full h-full"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {MOCK_ROUTES.map((route) => (
        <Polyline
          key={route.name}
          positions={route.positions}
          pathOptions={{ color: route.color, weight: 3, opacity: 0.8 }}
        >
          <Popup>{route.name}</Popup>
        </Polyline>
      ))}
    </MapContainer>
  )
}
