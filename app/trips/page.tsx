import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import CurrentPageTitle from "@/components/common/current-page-title";
import { Trip, tripDto, TripsSchema } from "@/lib/dtos/trip";
import z from "zod";
import { PlusIcon } from "lucide-react";
import router from "next/router";



async function fetchTrips(): Promise<string> {
    await new Promise((resolve) => {
        setTimeout(() => {
            resolve;
        }, 5000); // Simulate 5-second delay
    });
    return JSON.stringify([
        {
            destination: "Greece",
            from: "10/11/2026",
            to: "17/11/2026",
            buddies: [
                { nome: "carlo", avatar: "avatar", skill: "advanced" },
                { nome: "mario", avatar: "avatar", skill: "advanced" },
                { nome: "giulia", avatar: "avatar", skill: "advanced" },
            ],
        },
        {
            destination: "Greece",
            from: "10/11/2026",
            to: "17/11/2026",
            buddies: [
                { nome: "carlo", avatar: "avatar", skill: "advanced" },
                { nome: "mario", avatar: "avatar", skill: "advanced" },
                { nome: "giulia", avatar: "avatar", skill: "advanced" },
            ],
        },
        {
            destination: "Greece",
            from: "10/11/2026",
            to: "17/11/2026",
            buddies: [
                { nome: "carlo", avatar: "avatar", skill: "advanced" },
                { nome: "mario", avatar: "avatar", skill: "advanced" },
                { nome: "giulia", avatar: "avatar", skill: "advanced" },
            ],
        },
    ])
}


export default async function Page() {


    let trips: Array<Trip> = await TripsSchema.parseAsync(fetchTrips());
    const navigate = () => 
    return (
        <>
            <CurrentPageTitle />

            <div className="w-full bg-blue-500">
                {trips.map((trip, index) => {
                    return (
                        <Card className="w-full m-1" key={trip.id}>
                            <CardHeader>
                                <CardTitle>{trip.destination}</CardTitle>
                                <CardAction onClick={() => router.push(`/trips/trip/${trip.id}`)}><PlusIcon/></CardAction>
                            </CardHeader>
                            <CardContent>
                                <p>Card Content</p>
                            </CardContent>
                            <CardFooter>
                                <p>Card Footer</p>
                            </CardFooter>
                        </Card>
                    )
                })}
            </div>
        </>
    )
}