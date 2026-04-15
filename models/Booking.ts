// ── Booking Model (Mongoose)
// TODO: Implement when backend/MongoDB is ready.
//
// import mongoose, { Schema, model, models } from "mongoose";
//
// const BookingSchema = new Schema({
//   id: { type: String, required: true, unique: true },
//   name: { type: String, required: true },
//   contact: { type: String, required: true },
//   email: { type: String, required: true },
//   date: { type: String, required: true },
//   guests: { type: Number, required: true },
//   package: { type: String, required: true },
//   rooms: [{ type: Number }],
//   overtime: { type: Number, default: 0 },
//   total: { type: Number, required: true },
//   downpayment: { type: Number, required: true },
//   status: { type: String, enum: ["On Hold","Confirmed","Completed","Cancelled"], default: "On Hold" },
//   paymentProof: { type: Boolean, default: false },
//   notes: { type: String, default: "" },
//   createdAt: { type: Number, default: Date.now },
// }, { timestamps: true });
//
// export const Booking = models.Booking || model("Booking", BookingSchema);
