/* Brand kit for the showreel — edit this file to re-skin or re-word it, then
 * re-render with:  node render.mjs
 */
window.BRAND = {
  name: 'Start Scale & Succeed',
  url: 'startscaleandsucceed.com',

  colors: {
    ink: '#0A1A2F',     // deep navy — dark scenes
    ink2: '#14345E',    // navy gradient partner
    sky1: '#7DBEF0',    // logo ring — deep stop
    sky2: '#A3D1F7',    // logo ring — mid stop
    sky3: '#D6EBFD',    // logo ring — light stop
    paper: '#F4F9FE',   // ice white — light scenes
    white: '#FFFFFF'
  },

  // The logo: a gradient ring, rebuilt as vector (conic gradient, measured off the
  // supplied PNG). Stops run clockwise from 12 o'clock.
  ring: [
    [0.000, '#B9DDFA'], [0.125, '#E2F1FE'], [0.250, '#BFE0FA'], [0.375, '#86C2F2'],
    [0.500, '#A6D3F8'], [0.625, '#A0CFF7'], [0.750, '#94C9F5'], [0.875, '#7FBDF0'],
    [1.000, '#B9DDFA']
  ],

  fonts: {
    display: "'Poppins', sans-serif",
    sans: "'Poppins', sans-serif",
    pop: "'Anton', Impact, 'Arial Black', sans-serif" // word-pop captions
  },

  // Portfolio slides (exported from the decks in Canva)
  work: {
    hero: [
      { src: 'assets/work/hostloop-1.jpg', name: 'Hostloop', kind: 'Investor pitch deck' },
      { src: 'assets/work/soleprint-1.jpg', name: 'Soleprint', kind: 'Investor pitch deck' },
      { src: 'assets/work/hale-1.jpg', name: 'Hale Watches', kind: 'Investor deck' },
      { src: 'assets/work/lintel-2.jpg', name: 'Lintel', kind: 'Investor deck' }
    ],
    more: [
      'assets/work/hostloop-2.jpg', 'assets/work/soleprint-2.jpg', 'assets/work/hale-2.jpg', 'assets/work/lintel-1.jpg',
      'assets/work/hostloop-3.jpg', 'assets/work/soleprint-3.jpg', 'assets/work/hale-3.jpg', 'assets/work/lintel-3.jpg',
      'assets/work/hostloop-5.jpg', 'assets/work/soleprint-5.jpg', 'assets/work/hale-5.jpg', 'assets/work/lintel-4.jpg'
    ]
  },

  copy: {
    start: 'Business plans',
    stepsKicker: 'What we build',
    stepsHeading: 'From idea to investor-ready',
    steps: [
      { label: 'Your idea', icon: 'idea', pop: { html: 'GOT AN <span class="hl hl-navy">IDEA?</span>', position: 'above', tilt: 'rotate-left' } },
      { label: 'Business plan', icon: 'plan' },
      { label: 'Pitch deck', icon: 'deck', pop: { html: '<span class="hl hl-sky">PITCH</span> READY!', position: 'below', tilt: 'rotate-right' } },
      { label: 'Investors', icon: 'investors' }
    ],
    scale: 'Investor pitch decks',
    workKicker: 'Recent work',
    offer: 'Business plans  ·  Investor pitch decks',
    cta: 'Start today'
  }
};
