// ── The intro the first time the site opens in a session
//
// Three stones stack and a pine rises from them ("where stone meets the
// woods"), the wordmark rises letter by letter, then the whole thing lifts
// away. About 2.8 seconds, once per browser session.
//
// Server-rendered and animated in CSS (app/intro.css), so it is on screen in
// the first paint, before any JavaScript, and the page never flashes behind
// it. The script ahead of it skips it before it paints when it has already
// played this session, or on the admin and staff sign-in; the one after it
// lets a tap skip it and takes it out of the page when it is done.

const SKIP = `(function(){try{var p=location.pathname;var seen=sessionStorage.getItem('sw_intro');if(seen||p.indexOf('/admin')===0||p.indexOf('/login')===0){document.documentElement.classList.add('sw-intro-skip');}else{sessionStorage.setItem('sw_intro','1');}}catch(e){}})();`;
const DONE = `(function(){var el=document.getElementById('sw-intro');if(!el)return;var end=function(){el.classList.add('sw-intro--done');setTimeout(function(){el.style.display='none';},700);};el.addEventListener('click',end);setTimeout(function(){el.style.display='none';},3500);})();`;

const WORD = "STONEWOOD";

export function IntroSplash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SKIP }} />
      <div id="sw-intro" className="sw-intro" aria-hidden="true">
        <div className="sw-intro__glow" />
        <div className="sw-intro__inner">
          <svg className="sw-intro__mark" viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {/* Stones, bottom up, then the pine on top of them. */}
            <path className="sw-intro__draw" style={{ animationDelay: ".15s" }} pathLength={1} d="M26 96c0-6 15-10 34-10s34 4 34 10-15 9-34 9-34-3-34-9Z" />
            <path className="sw-intro__draw" style={{ animationDelay: ".4s" }} pathLength={1} d="M36 79c0-5 11-8 24-8s24 3 24 8-11 7-24 7-24-2-24-7Z" />
            <path className="sw-intro__draw" style={{ animationDelay: ".62s" }} pathLength={1} d="M46 65c0-4 6-6 14-6s14 2 14 6-6 5-14 5-14-1-14-5Z" />
            <path className="sw-intro__draw sw-intro__draw--pine" style={{ animationDelay: ".85s" }} pathLength={1} d="M60 12 48 33h6L43 49h34L66 33h6L60 12Z" />
            <path className="sw-intro__draw" style={{ animationDelay: "1.05s" }} pathLength={1} d="M60 49v8" />
          </svg>
          <div className="sw-intro__word">
            {WORD.split("").map((ch, i) => (
              <span key={i} style={{ animationDelay: `${1.05 + i * 0.05}s` }}>{ch}</span>
            ))}
          </div>
          <span className="sw-intro__rule" />
          <div className="sw-intro__sub">PRIVATE RESORT</div>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: DONE }} />
    </>
  );
}
