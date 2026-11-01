"use client";

/**
 * A loading placeholder shaped like each page, so what the visitor sees
 * while it loads is the page itself, greyed out: the same columns, the same
 * cards, in the same places. One per route (the `loading.tsx` files) plus
 * the in-page ones Rooms, Packages, Gallery and the home page show while
 * their collection is still on its way.
 *
 * Every shape is a `.sk` bone (PageSkeletons.css): the site's gold glass
 * with a shimmer sweeping across. Decorative, so each skeleton is one
 * `role="status"` with a single spoken label and the shapes hidden from
 * screen readers.
 */

import type { CSSProperties, ReactNode } from "react";
import { THEME_COLORS } from "@/lib/theme";
import "./PageSkeletons.css";

/** One shape. Width/height take any CSS length. */
function B({ w = "100%", h = 14, r, className = "", style }: { w?: string | number; h?: string | number; r?: number | string; className?: string; style?: CSSProperties }) {
  return <div className={`sk ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/** The live region around a set of shapes. */
function Status({ label, children, page = false }: { label: string; children: ReactNode; page?: boolean }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={page ? "sk-page" : undefined}
      data-sw-route-loading={page ? "" : undefined}
      style={page ? { background: THEME_COLORS.bg } : undefined}>
      <span className="sk-sr">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** The site's top bar: wordmark, links, Book Now. */
function NavBones() {
  return (
    <div className="sk-nav">
      <B w={150} h={22} r={6} />
      <div className="sk-nav__links">{[64, 64, 84, 68, 82].map((w, i) => <B key={i} w={w} h={12} r={6} />)}</div>
      <B w={118} h={40} r={10} />
    </div>
  );
}

/** A centred section head: eyebrow, title, line. */
function HeadBones({ title = 360 }: { title?: number }) {
  return (
    <div className="sk-head">
      <B w={130} h={10} r={5} />
      <B w={title} h={38} r={10} className="sk-head__title" />
      <B w={440} h={12} r={6} />
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────────────────
export function HomeSkeleton() {
  return (
    <Status label="Loading the home page" page>
      <NavBones />
      {/* The hero: a full-width photo with the headline and the button. */}
      <div className="sk-hero">
        <div className="sk-hero__copy">
          <B w={150} h={11} r={5} />
          <B w="min(560px, 80%)" h={56} r={12} />
          <B w="min(420px, 60%)" h={56} r={12} />
          <B w="min(380px, 70%)" h={13} r={6} />
          <B w={210} h={50} r={12} className="sk-mt" />
        </div>
      </div>
      <div className="sk-wrap">
        <HeadBones title={320} />
        <div className="sk-durations">{[0, 1, 2].map((i) => <div key={i} className="sk-row"><B w={40} h={40} r={20} /><div className="sk-col"><B w={80} h={10} /><B w={150} h={14} /></div></div>)}</div>
        <PackagesBody />
      </div>
    </Status>
  );
}

// ── Packages ──────────────────────────────────────────────────────────
/** The wheel on the left and one package card (photo | details). */
function PackagesBody() {
  return (
    <div className="sk-pkg">
      <div className="sk-pkg__wheel">
        <B w="55%" h={20} r={8} className="sk-dim" />
        <B w="80%" h={42} r={10} />
        <B w="70%" h={12} r={6} />
        <B w="85%" h={12} r={6} />
        <B w="60%" h={20} r={8} className="sk-dim" />
        <div className="sk-row sk-mt">{[34, 18, 18].map((w, i) => <B key={i} w={w} h={3} r={2} />)}</div>
      </div>
      <div className="sk-pkg__card">
        <B h="100%" r={0} className="sk-pkg__photo" />
        <div className="sk-pkg__info">
          <B w={130} h={24} r={999} />
          <B w={90} h={10} r={5} className="sk-mt" />
          <B w={170} h={40} r={10} />
          <B w="92%" h={12} /><B w="78%" h={12} />
          <B w={120} h={10} r={5} className="sk-mt" />
          {[0, 1, 2, 3].map((i) => <div key={i} className="sk-row"><B w={14} h={14} r={7} /><B w={`${70 - i * 8}%`} h={12} /></div>)}
          <B h={50} r={12} className="sk-push" />
        </div>
      </div>
    </div>
  );
}

export function PackagesSkeleton({ page = true }: { page?: boolean }) {
  const body = <div className={page ? "sk-wrap" : undefined}>{page && <HeadBones title={360} />}<PackagesBody /></div>;
  return page
    ? <Status label="Loading packages" page><NavBones />{body}</Status>
    : <Status label="Loading packages">{body}</Status>;
}

// ── Rooms ─────────────────────────────────────────────────────────────
/** Wide rows, the photo and the words alternating sides. */
export function RoomsSkeleton({ page = true }: { page?: boolean }) {
  const body = (
    <div className={page ? "sk-wrap" : undefined}>
      {page && <HeadBones title={300} />}
      <div className="sk-rooms">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`sk-room${i % 2 ? " is-flip" : ""}`}>
            <B h="100%" r={18} className="sk-room__photo" />
            <div className="sk-room__text">
              <B w={80} h={10} r={5} />
              <B w="70%" h={32} r={10} />
              <B w="55%" h={13} />
              <B w={140} h={22} r={8} />
              <B w="95%" h={12} /><B w="85%" h={12} /><B w="60%" h={12} />
              <div className="sk-row sk-mt"><B w={180} h={46} r={8} /><B w={90} h={14} /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  return page ? <Status label="Loading rooms" page><NavBones />{body}</Status> : <Status label="Loading rooms">{body}</Status>;
}

// ── Gallery ───────────────────────────────────────────────────────────
/** A masonry of photos in mixed heights. */
export function GallerySkeleton({ page = true }: { page?: boolean }) {
  const heights = [260, 180, 320, 220, 280, 200, 240, 300, 190, 260, 210, 280];
  const body = (
    <div className={page ? "sk-wrap" : undefined}>
      {page && <HeadBones title={280} />}
      <div className="sk-chips">{[60, 80, 90, 70, 84].map((w, i) => <B key={i} w={w} h={34} r={999} />)}</div>
      <div className="sk-masonry">{heights.map((h, i) => <B key={i} h={h} r={16} />)}</div>
    </div>
  );
  return page ? <Status label="Loading the gallery" page><NavBones />{body}</Status> : <Status label="Loading the gallery">{body}</Status>;
}

// ── About ─────────────────────────────────────────────────────────────
export function AboutSkeleton() {
  return (
    <Status label="Loading About us" page>
      <NavBones />
      {/* The glowing title band. */}
      <div className="sk-band">
        <B w={110} h={11} r={5} />
        <B w="min(460px, 80%)" h={54} r={12} />
        <B w={100} h={4} r={2} />
      </div>
      <div className="sk-wrap">
        <div className="sk-about">
          <div className="sk-col">
            <B w={140} h={11} r={5} />
            <B w="90%" h={38} r={10} /><B w="60%" h={38} r={10} />
            <B w="95%" h={13} /><B w="88%" h={13} /><B w="70%" h={13} />
          </div>
          <div className="sk-card">
            {[0, 1, 2, 3].map((i) => <div key={i} className="sk-row sk-line"><B w={44} h={44} r={10} /><div className="sk-col" style={{ flex: 1 }}><B w={90} h={14} /><B w="75%" h={11} /></div></div>)}
          </div>
        </div>
        <div className="sk-faq">
          <div className="sk-col"><B w={200} h={22} r={8} /><B w={220} h={11} /></div>
          <div className="sk-card">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="sk-row sk-line sk-between"><B w={`${60 - i * 5}%`} h={14} /><B w={16} h={16} r={4} /></div>)}</div>
        </div>
      </div>
    </Status>
  );
}

// ── Book Now ──────────────────────────────────────────────────────────
export function BookSkeleton() {
  return (
    <Status label="Loading the booking form" page>
      <NavBones />
      <div className="sk-wrap">
        <HeadBones title={340} />
        {/* The step track. */}
        <div className="sk-steps">
          <div className="sk-row sk-between"><B w={90} h={10} /><B w={110} h={10} /></div>
          <B h={6} r={999} />
          <div className="sk-steps__labels">{[0, 1, 2, 3, 4].map((i) => <B key={i} w={70} h={10} />)}</div>
        </div>
        <div className="sk-book">
          {/* The step card: calendar | choices. */}
          <div className="sk-card sk-book__main">
            <B w={130} h={10} r={5} /><B w={260} h={30} r={10} />
            <div className="sk-book__cols">
              <div className="sk-cal">
                <div className="sk-row sk-between"><B w={36} h={36} r={18} /><B w={140} h={20} r={8} /><B w={36} h={36} r={18} /></div>
                <div className="sk-cal__grid">{Array.from({ length: 35 }, (_, i) => <B key={i} h={40} r={8} />)}</div>
              </div>
              <div className="sk-col">
                <B w={140} h={10} r={5} />
                <div className="sk-trio">{[0, 1, 2].map((i) => <B key={i} h={86} r={10} />)}</div>
                <B w={140} h={10} r={5} className="sk-mt" />
                {[0, 1, 2].map((i) => <B key={i} h={44} r={10} />)}
                <B w={90} h={10} r={5} className="sk-mt" />
                <B h={48} r={10} />
              </div>
            </div>
          </div>
          {/* The booking summary on the right. */}
          <div className="sk-card sk-book__side">
            <B w={150} h={10} r={5} /><B w="80%" h={22} r={8} />
            <B w="95%" h={11} /><B w="85%" h={11} /><B w="60%" h={11} />
            <B h={1} className="sk-mt" />
            <div className="sk-row sk-between"><B w={60} h={18} /><B w={90} h={24} r={8} /></div>
            <B w="70%" h={11} />
          </div>
        </div>
      </div>
    </Status>
  );
}

// ── Manage booking / Customer Service: a form in a card ──────────────
function FormCard({ fields = 3, area = false }: { fields?: number; area?: boolean }) {
  return (
    <div className="sk-card sk-form">
      <B w={120} h={10} r={5} /><B w="60%" h={28} r={10} /><B w="85%" h={12} />
      {Array.from({ length: fields }, (_, i) => <div key={i} className="sk-col sk-mt"><B w={110} h={10} r={5} /><B h={46} r={10} /></div>)}
      {area && <div className="sk-col sk-mt"><B w={110} h={10} r={5} /><B h={120} r={10} /></div>}
      <B h={50} r={12} className="sk-mt" />
    </div>
  );
}

export function ManageBookingSkeleton() {
  return (
    <Status label="Loading your booking" page>
      <NavBones />
      <div className="sk-wrap sk-narrow"><HeadBones title={300} /><FormCard fields={2} /></div>
    </Status>
  );
}

export function CustomerSkeleton() {
  return (
    <Status label="Loading Customer Service" page>
      <NavBones />
      <div className="sk-wrap sk-narrow">
        <HeadBones title={320} />
        <div className="sk-chips sk-center">{[96, 110, 100, 92].map((w, i) => <B key={i} w={w} h={36} r={999} />)}</div>
        <FormCard fields={3} area />
      </div>
    </Status>
  );
}

// ── Staff sign-in ─────────────────────────────────────────────────────
export function LoginSkeleton() {
  return (
    <Status label="Loading sign-in" page>
      <div className="sk-login">
        <div className="sk-card sk-login__card">
          <B w={56} h={56} r={16} className="sk-center-self" />
          <B w="60%" h={26} r={8} className="sk-center-self" />
          <B w="75%" h={12} className="sk-center-self" />
          {[0, 1].map((i) => <div key={i} className="sk-col sk-mt"><B w={90} h={10} r={5} /><B h={46} r={10} /></div>)}
          <B h={50} r={12} className="sk-mt" />
        </div>
      </div>
    </Status>
  );
}

// ── Admin ─────────────────────────────────────────────────────────────
/** The admin shell: the sidebar, then a page of figures and a table. */
export function AdminSkeleton() {
  return (
    <Status label="Loading the admin" page>
      <div className="sk-admin">
        <div className="sk-admin__side">
          <B w={130} h={18} r={6} /><B w={80} h={9} r={4} />
          {[0, 1, 2, 3].map((g) => (
            <div key={g} className="sk-col sk-mt">
              <B w={90} h={9} r={4} className="sk-dim" />
              {[0, 1, 2].slice(0, g === 3 ? 1 : 2 + (g % 2)).map((i) => <div key={i} className="sk-row"><B w={16} h={16} r={4} /><B w={`${60 + ((g + i) % 3) * 10}%`} h={11} /></div>)}
            </div>
          ))}
          <B h={52} r={12} className="sk-push" />
        </div>
        <div className="sk-admin__main">
          <div className="sk-row sk-between"><div className="sk-col"><B w={220} h={30} r={8} /><B w={300} h={12} /></div><B w={150} h={42} r={10} /></div>
          <div className="sk-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="sk-card sk-col"><div className="sk-row sk-between"><B w="50%" h={11} /><B w={30} h={30} r={15} /></div><B w="45%" h={28} r={8} /><B w="60%" h={10} /></div>)}</div>
          <div className="sk-card sk-col">
            <B w={180} h={16} r={6} />
            <div className="sk-bars">{[40, 70, 55, 85, 30, 65, 90, 45, 75, 60, 50, 80].map((h, i) => <B key={i} h={`${h}%`} r={4} />)}</div>
          </div>
          <div className="sk-card sk-table">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="sk-row sk-line sk-between">{[14, 18, 22, 14, 12].map((w, j) => <B key={j} w={`${w}%`} h={i === 0 ? 9 : 12} className={i === 0 ? "sk-dim" : undefined} />)}</div>)}
          </div>
        </div>
      </div>
    </Status>
  );
}
