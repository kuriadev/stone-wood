"use client";

import { useState, useEffect, useRef } from "react";
import { calcTotal, genBookingId, fmtTimer } from "@/lib/utils";
import type { Booking } from "@/types/booking";
import type { Room } from "@/types/room";

interface UseBookingOptions {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  rooms: Room[];
  closedDates: string[];
  preselectedRoom?: number | null;
  clearPreselected?: () => void;
  preselectedDate?: string;
  clearPreselectedDate?: () => void;
}

export function useBooking({
  bookings,
  setBookings,
  rooms,
  closedDates,
  preselectedRoom,
  clearPreselected,
  preselectedDate,
  clearPreselectedDate,
}: UseBookingOptions) {
  const [method, setMethod] = useState<null | "online" | "onsite">(null);
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(preselectedDate || "");
  const [guests, setGuests] = useState(10);
  const [overtime, setOvertime] = useState(0);
  const [selRooms, setSelRooms] = useState<number[]>(preselectedRoom ? [preselectedRoom] : []);
  const [form, setFormState] = useState({ name: "", email: "", contact: "", notes: "" });
  const [bookingId, setBookingId] = useState("");
  const [osForm, setOsFormState] = useState({ name: "", contact: "", email: "", date: "" });
  const [qrSeconds, setQrSeconds] = useState(600);
  const [qrExpired, setQrExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setF = (k: string, v: string) => setFormState((f) => ({ ...f, [k]: v }));
  const setOsF = (k: string, v: string) => setOsFormState((f) => ({ ...f, [k]: v }));

  const bookedDates = bookings.filter((b) => b.status !== "Cancelled").map((b) => b.date);
  const closedSet = new Set(closedDates);
  const dateOk = date && !bookedDates.includes(date) && !closedSet.has(date);
  const total = calcTotal(guests, overtime, selRooms, rooms);
  const down = Math.ceil(total / 2);

  const toggleRoom = (id: number) =>
    setSelRooms((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

  const handleContact = (v: string) => setF("contact", v.replace(/\D/g, "").slice(0, 11));
  const handleOsContact = (v: string) => setOsF("contact", v.replace(/\D/g, "").slice(0, 11));

  useEffect(() => {
    if (step === 6) {
      setQrSeconds(600);
      setQrExpired(false);
      timerRef.current = setInterval(() => {
        setQrSeconds((s) => {
          if (s <= 1) {
            clearInterval(timerRef.current!);
            setQrExpired(true);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step]);

  const confirmOnline = () => {
    const id = genBookingId(bookings.length);
    setBookingId(id);
    const pkg = selRooms.length > 0 ? "Day Tour + Room" : "Day Tour";
    setBookings((b) => [
      ...b,
      {
        id,
        name: form.name,
        contact: form.contact,
        email: form.email,
        date,
        guests,
        package: pkg,
        rooms: selRooms,
        overtime,
        total,
        downpayment: down,
        status: "On Hold",
        paymentProof: false,
        notes: form.notes,
        createdAt: Date.now(),
      },
    ]);
    clearPreselected?.();
    clearPreselectedDate?.();
    if (timerRef.current) clearInterval(timerRef.current);
    setStep(7);
  };

  const confirmOnsite = () => {
    const id = genBookingId(bookings.length);
    setBookingId(id);
    setBookings((b) => [
      ...b,
      {
        id,
        name: osForm.name,
        contact: osForm.contact,
        email: osForm.email || "—",
        date: osForm.date || "—",
        guests: 1,
        package: "On-Site Reservation",
        rooms: [],
        overtime: 0,
        total: 0,
        downpayment: 0,
        status: "On Hold",
        paymentProof: false,
        notes: "On-site reservation — payment upon arrival",
        createdAt: Date.now(),
      },
    ]);
    clearPreselected?.();
    clearPreselectedDate?.();
    setStep(11);
  };

  return {
    method, setMethod,
    step, setStep,
    date, setDate,
    guests, setGuests,
    overtime, setOvertime,
    selRooms, toggleRoom,
    form, setF,
    osForm, setOsF,
    bookingId,
    qrSeconds, qrExpired,
    total, down,
    dateOk, bookedDates, closedSet,
    handleContact, handleOsContact,
    confirmOnline, confirmOnsite,
    fmtTimer,
  };
}
