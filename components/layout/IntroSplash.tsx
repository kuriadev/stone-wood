// ── The intro the first time the site opens in a session
//
// The favicon mark builds itself (ring, gold disc, then the two halves of
// the S), the wordmark rises letter by letter, then the whole thing lifts
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
// One half of the S: a triangle with a bar running out to the disc's edge.
// The other half is the same shape turned 180 degrees.
const HALF = "M76 80 L104 30 L138 68 Q142 72 150 72 L220 72 L220 80 Z";

export function IntroSplash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SKIP }} />
      <div id="sw-intro" className="sw-intro" aria-hidden="true">
        <div className="sw-intro__glow" />
        <div className="sw-intro__inner">
          <svg className="sw-intro__mark" viewBox="0 0 217 217">
            {/* The favicon mark: a gold ring draws, fills to a disc, then the
                two halves of the S slide in from opposite edges. */}
            <defs>
              <clipPath id="sw-intro-clip"><circle cx="108.5" cy="108.5" r="108.5" /></clipPath>
            </defs>
            <circle className="sw-intro__draw" style={{ animationDelay: ".15s" }} pathLength={1} cx="108.5" cy="108.5" r="106" fill="none" stroke="currentColor" strokeWidth="3" />
            <circle className="sw-intro__disc" cx="108.5" cy="108.5" r="108.5" fill="currentColor" />
            <g clipPath="url(#sw-intro-clip)">
              <path className="sw-intro__half" d={HALF} />
              <g transform="rotate(180 108.5 108.5)">
                <path className="sw-intro__half sw-intro__half--b" d={HALF} />
              </g>
            </g>
          </svg>
          <div className="sw-intro__word">
            {WORD.split("").map((ch, i) => (
              <span key={i} style={{ animationDelay: `${1.05 + i * 0.05}s` }}>{ch}</span>
            ))}
          </div>
          <span className="sw-intro__rule" />
          <div className="sw-intro__sub">GARDEN PRIVATE RESORT</div>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: DONE }} />
    </>
  );
}
