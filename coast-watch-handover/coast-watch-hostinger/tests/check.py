"""Headless check for the Hostinger build. Serve the folder with: python3 -m http.server 8200"""
import json, re, time, sys
from playwright.sync_api import sync_playwright
URL='http://localhost:8200/'; SS='/workspace/coast-watch-hostinger/screenshots/'
CSP=open('/workspace/coast-watch-hostinger/.htaccess').read().split('Content-Security-Policy "')[1].split('"')[0]
out={}
def ready(pg): pg.wait_for_function("() => /^[0-9]+$/.test(document.getElementById('n-quiet').textContent.trim()) || !document.getElementById('banner').hidden", timeout=30000)
def wx_ready(pg): pg.wait_for_function("() => !/…|Checking/.test(document.getElementById('home-rain').textContent)", timeout=30000)
def with_csp(route):
    r=route.fetch(); h=dict(r.headers); h['content-security-policy']=CSP; route.fulfill(response=r, headers=h)
def watch(pg, errs):
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: '+str(e)))
    pg.on('requestfailed', lambda r: errs.append('requestfailed: '+r.url[:100]) if 'tile.openstreetmap' not in r.url else None)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for w,h,tag in ((390,844,'phone'),(1366,900,'desktop')):
        ctx=b.new_context(viewport={'width':w,'height':h}, device_scale_factor=2 if w<500 else 1, accept_downloads=True, color_scheme='dark')
        pg=ctx.new_page(); errs=[]; watch(pg,errs); reqs=[]
        pg.on('request', lambda r: reqs.append(r.url))
        pg.route(re.compile(r'localhost:8200/(\?.*)?(#.*)?$'), with_csp)
        pg.goto(URL); ready(pg); wx_ready(pg); pg.wait_for_timeout(600)
        o=out[tag]={}
        o['counts']={k:pg.inner_text('#n-'+k) for k in ['active','recent','quiet','unknown']}
        o['home_status']=pg.inner_text('#home-status'); o['home_summary']=pg.inner_text('#home-summary')
        o['home_metrics']=pg.inner_text('.metrics').replace('\n',' | ')
        o['home_moon']=pg.inner_text('#home-moon').replace('\n',' | ')
        o['area_title']=pg.inner_text('#area-title'); o['rain_context']=pg.inner_text('#rain-context')
        o['rain_bars_home']=pg.locator('#home-strip .rain-strip i').count()
        pg.screenshot(path=SS+f'{tag}-home.png', full_page=(tag=='desktop'))
        if tag=='phone': pg.screenshot(path=SS+'phone-home-full.png', full_page=True)
        pg.click('.tabs a[data-view=beaches]'); pg.wait_for_timeout(300)
        o['beach_cards']=pg.locator('#beach-list details').count()
        o['first_beach']=pg.inner_text('#beach-list details >> nth=0 >> summary').replace('\n',' | ')[:200]
        pg.click('#beach-list details[data-beach=alum] summary'); pg.wait_for_timeout(200)
        o['alum_open']=pg.inner_text('#beach-list details[data-beach=alum] .card-more').replace('\n',' | ')[:300]
        pg.screenshot(path=SS+f'{tag}-beaches.png')
        # save a beach, appears on home
        pg.click('#beach-list details[data-beach=alum] .star'); pg.click('.tabs a[data-view=home]'); pg.wait_for_timeout(200)
        o['my_beaches']=[pg.inner_text(f'#my-beaches details >> nth={i} >> h3') for i in range(pg.locator('#my-beaches details').count())]
        pg.click('.tabs a[data-view=history]'); pg.wait_for_timeout(300)
        o['history_title']=pg.inner_text('#history-title'); o['history_events']=pg.inner_text('#history-events')[:200]
        o['history_options']=pg.locator('#history-select option').count()
        pg.select_option('#history-select','WXW00155'); pg.wait_for_timeout(300)
        o['history_after_select']=pg.inner_text('#history-title')+' | hash='+pg.evaluate('location.hash')
        with pg.expect_download() as d: pg.click('#history-csv')
        o['history_csv_lines']=len(open(d.value.path()).read().splitlines())
        pg.screenshot(path=SS+f'{tag}-history.png', full_page=(tag=='desktop'))
        pg.click('.tabs a[data-view=conditions]'); pg.wait_for_timeout(500)
        o['conditions']={k:pg.inner_text('#'+k) for k in ['rain-24','rain-48','rain-next','wind-speed','wind-gust','air-temp','sea-trend','sea-level','wave-height','sea-temp','sunrise','sunset','model-high','model-low','moon-phase','moon-lit','moon-age','moon-full','moon-new']}
        o['tide_svg']=pg.locator('#tide-curve svg').count(); o['rain_chart_bars']=pg.locator('#rain-chart rect').count()
        o['moon_svg']=pg.locator('#moon-face svg').count(); o['moon_steps']=pg.locator('#moon-cycle-steps .moon-step').count(); o['moon_now']=pg.locator('#moon-cycle-steps .moon-step.now').count()
        o['moon_note']=pg.inner_text('#moon-tide-note')
        pg.screenshot(path=SS+f'{tag}-conditions.png', full_page=True)
        pg.locator('#moon-card').scroll_into_view_if_needed(); pg.evaluate("document.getElementById('toast').hidden = true"); pg.wait_for_timeout(200)
        pg.screenshot(path=SS+f'moon-{tag}.png')
        pg.click('.tabs a[data-view=map]'); pg.wait_for_timeout(3000)
        o['map_circles']=pg.locator('path.leaflet-interactive').count(); o['beach_pins']=pg.locator('.beach-pin').count()
        o['tiles_loaded']=sum('tile.openstreetmap' in r for r in reqs)
        for f in ['active','recent','quiet','unknown','all']:
            pg.click(f'[data-filter={f}]'); pg.wait_for_timeout(150); o['filter_'+f]=pg.inner_text('#result-count')
        pg.fill('#search','sandbanks'); pg.wait_for_timeout(200); o['search']=[pg.inner_text(f'#outfall-list article >> nth={i} >> h3') for i in range(pg.locator('#outfall-list article').count())]
        pg.fill('#search',''); pg.select_option('#area','bournemouth'); pg.wait_for_timeout(200); o['area_bournemouth']=pg.inner_text('#result-count'); pg.select_option('#area','all')
        with pg.expect_download() as d: pg.click('#csv')
        o['csv_lines']=len(open(d.value.path()).read().splitlines())
        pg.wait_for_timeout(1500); pg.screenshot(path=SS+f'{tag}-map.png')
        pg.click('.tabs a[data-view=alerts]'); pg.wait_for_timeout(300)
        o['alerts_summary']=pg.inner_text('#alerts-summary').replace('\n',' | '); o['alert_cards']=pg.locator('#alert-cards a').count()
        pg.select_option('#alert-period','all'); pg.wait_for_timeout(200); o['alert_cards_all']=pg.locator('#alert-cards a').count()
        pg.screenshot(path=SS+f'{tag}-alerts.png')
        # motion toggle + persistence
        pg.click('#motion-toggle'); o['motion']=pg.get_attribute('#motion-toggle','aria-pressed')+' '+str(pg.evaluate("document.body.classList.contains('motion-paused')"))
        pg.goto(URL+'#view=history&place=WXW00991'); ready(pg); pg.wait_for_timeout(500)
        o['deeplink']=pg.inner_text('#history-title')+' view='+pg.evaluate("document.querySelector('.tabs [aria-current]').dataset.view")
        o['storage']=pg.evaluate("[localStorage.getItem('coast-watch.v6'),localStorage.getItem('coast-watch.motion-paused')]")
        if tag=='phone':
            out['calc']=pg.evaluate("""() => {
              const DAY=86400000, now=Date.UTC(2026,10,20,14,0,0);
              const rec=o=>Object.assign({Status:0,LastUpdated:now,LatestEventStart:now-3600000,LatestEventEnd:now-1800000,StatusStart:now-1800000},o);
              const kind=(o,t=now,checked=now,err=null)=>CW_classifyStatus(rec(o),t,checked,err);
              const status={
                active: kind({Status:1,LatestEventEnd:null,StatusStart:now-95*60000,LatestEventStart:now-95*60000}),
                recent: kind({Status:0,LatestEventEnd:now-3*3600000,LatestEventStart:now-5*3600000,StatusStart:now-3*3600000}),
                quiet: kind({Status:0,LatestEventEnd:now-28*DAY,LatestEventStart:now-28*DAY-3600000,StatusStart:now-28*DAY}),
                offline: kind({Status:-1}),
                stale: kind({Status:1,LastUpdated:now-3*3600000,LatestEventEnd:null}),
                endedOpen: kind({Status:0,LatestEventEnd:null,LatestEventStart:now-3600000}),
                unchecked: CW_classifyStatus(rec({Status:1}), now, null, null)
              };
              const mapping=Object.fromEntries(CW_BEACHES.map(b=>[b.id,{name:b.name,outfalls:b.outfalls.slice()}]));
              const iso=ms=>new Date(ms).toISOString();
              const errMin=(m,t,keys)=>Math.min(...keys.map(k=>Math.abs(m[k]-t)))/60000;
              const atNow=CW_moonPhase(now), atFull=CW_moonPhase(Date.UTC(2026,10,24,14,53,0)), atNew=CW_moonPhase(Date.UTC(2026,11,9,0,51,0)), atFQ=CW_moonPhase(Date.UTC(2026,10,17,11,47,0));
              return {
                status,
                mapping,
                branksomeOutfalls: mapping.branksome.outfalls,
                shoreRoadOutfalls: mapping['shore-road'].outfalls,
                branksomeHasShoreRoad: mapping.branksome.outfalls.includes('WXW00991'),
                shoreRoadHasOwn: mapping['shore-road'].outfalls.includes('WXW00991'),
                moonNow:{name:atNow.name,lit:Math.round(atNow.illumination*100),age:+atNow.ageDays.toFixed(2),frac:+atNow.frac.toFixed(3),nextFull:iso(atNow.nextFull),nextNew:iso(atNow.nextNew)},
                full:{name:atFull.name,lit:Math.round(atFull.illumination*100),errMin:+errMin(atFull,Date.UTC(2026,10,24,14,53,0),['lastFull','nextFull']).toFixed(2)},
                newMoon:{name:atNew.name,lit:Math.round(atNew.illumination*100),errMin:+errMin(atNew,Date.UTC(2026,11,9,0,51,0),['lastNew','nextNew']).toFixed(2)},
                firstQuarter:{name:atFQ.name,lit:Math.round(atFQ.illumination*100)}
              };
            }""")
        o['errors']=errs; ctx.close()

    # faked discharge
    now=int(time.time()*1000)
    def mock_act(route):
        r=route.fetch(); body=r.json()
        for f in body['features']:
            a=f['attributes']
            if a['Id']=='WXW00865': a.update(Status=1,StatusStart=now-95*60000,LatestEventStart=now-95*60000,LatestEventEnd=None)
            if a['Id']=='WXW00155': a.update(Status=0,LatestEventStart=now-5*3600000,LatestEventEnd=now-3*3600000)
            if a['Id']=='WXW00153': a.update(Status=-1)
        route.fulfill(response=r,json=body)
    def mock_ev(route):
        route.fulfill(json={'features':[{'attributes':{'dischargeid':1,'overflowid':'15240B','dischargestart':now-95*60000,'dischargeend':None}},
          {'attributes':{'dischargeid':2,'overflowid':'15240B','dischargestart':now-14*3600000,'dischargeend':now-13*3600000}},
          {'attributes':{'dischargeid':3,'overflowid':'15019B','dischargestart':now-5*3600000,'dischargeend':now-3*3600000}}]})
    ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,color_scheme='dark'); pg=ctx.new_page(); errs=[]; watch(pg,errs)
    pg.route(re.compile(r'Storm_Overflow_Activity/FeatureServer/0/query'),mock_act); pg.route(re.compile(r'PROD_view/FeatureServer/1/query'),mock_ev)
    pg.goto(URL); ready(pg); wx_ready(pg); pg.wait_for_timeout(500)
    s=out['simulated']={}
    s['home_status']=pg.inner_text('#home-status'); s['home_summary']=pg.inner_text('#home-summary'); s['area_title']=pg.inner_text('#area-title')
    s['counts']={k:pg.inner_text('#n-'+k) for k in ['active','recent','quiet','unknown']}; s['rain_context']=pg.inner_text('#rain-context')
    s['nav_count']=pg.inner_text('#nav-alert-count'); s['home_strip_segments']=pg.locator('#home-strip .tl-bar i').count()
    pg.screenshot(path=SS+'phone-simulated-home.png')
    pg.click('.tabs a[data-view=beaches]'); pg.wait_for_timeout(200)
    s['beaches']={k:pg.inner_text(f'#beach-list [data-beach={k}] .card-line') for k in ['branksome','durley','boscombe','sandbanks']}
    pg.screenshot(path=SS+'phone-simulated-beaches.png')
    pg.click('.tabs a[data-view=history]'); pg.wait_for_timeout(300)
    s['history_rows']=pg.locator('#history-events tr').count()
    pg.screenshot(path=SS+'phone-simulated-history.png', full_page=True)
    pg.click('.tabs a[data-view=alerts]'); pg.wait_for_timeout(200)
    s['alerts_first']=[pg.inner_text(f'#alert-cards a >> nth={i} >> h3') for i in range(min(4,pg.locator('#alert-cards a').count()))]
    s['errors']=errs; ctx.close()

    # feeds down
    ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2); pg=ctx.new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'arcgis|open-meteo'), lambda r: r.abort())
    pg.goto(URL); ready(pg); pg.wait_for_timeout(1500)
    d=out['feeds_down']={'home_status':pg.inner_text('#home-status'),'summary':pg.inner_text('#home-summary'),'area':pg.inner_text('#area-title'),'banner':pg.inner_text('#banner'),'rain':pg.inner_text('#home-rain'),'rain_context':pg.inner_text('#rain-context')}
    pg.screenshot(path=SS+'phone-feeds-down.png')
    pg.click('.tabs a[data-view=beaches]'); pg.wait_for_timeout(200); d['branksome_beach']=pg.inner_text('#beach-list [data-beach=branksome] .card-body').replace('\n',' | ')
    pg.click('.tabs a[data-view=conditions]'); pg.wait_for_timeout(200); d['rain24']=pg.inner_text('#rain-24'); d['tide']=pg.inner_text('#tide-curve'); d['moon']=pg.inner_text('#moon-phase'); d['moon_lit']=pg.inner_text('#moon-lit')
    d['pageerrors']=errs; ctx.close()

    # light mode + 404
    ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,color_scheme='light'); pg=ctx.new_page()
    pg.goto(URL); ready(pg); wx_ready(pg); pg.wait_for_timeout(400); pg.screenshot(path=SS+'phone-light.png')
    r=pg.goto(URL+'manifest.webmanifest'); out['manifest_ok']=r.status==200 and 'Coast Watch' in r.text()
    pg.goto(URL+'404.html'); pg.screenshot(path=SS+'phone-404.png'); ctx.close()
    b.close()
print(json.dumps(out,indent=1,ensure_ascii=False))
