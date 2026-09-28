export interface Room {
  id: number;
  name: string;
  beds: string;
  capacity: number;
  price: number;
  desc: string;
  /** The cover. Kept as its own field because every card, list and booking
   *  summary reads it; it is always gallery[0] when a gallery exists. */
  img: string;
  /** Up to ROOM_GALLERY_MAX photos, cover first. Older rooms predate this
   *  and may be undefined -- read it as `room.gallery?.length ? … : [room.img]`. */
  gallery?: string[];
}
