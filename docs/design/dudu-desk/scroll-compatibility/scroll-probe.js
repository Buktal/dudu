(() => {
  const scrollers = new WeakSet();
  const events = [];
  const endpoint = 'http://127.0.0.1:9435/events';
  const record = event => events.push({time:Date.now(), ...event});
  record({type:'ready',ua:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight]});
  const attach = () => {
    for (const el of document.querySelectorAll('[data-virtuoso-scroller]')) {
      if (!el.querySelector('[data-slot="message"]') || scrollers.has(el)) continue;
      scrollers.add(el);
      const id=Math.random().toString(36).slice(2,9);
      for(const method of ['scrollTo','scrollBy']){
        const original=el[method].bind(el);
        el[method]=(...args)=>{record({type:'command',id,t:performance.now(),method,args});return original(...args);};
      }
      let lastWheel=0,delta=0,running=false;
      const sample = () => {
        const rect=el.getBoundingClientRect();
        const items=[...el.querySelectorAll('[data-item-index]')].map(item=>{
          const box=item.getBoundingClientRect();
          return [Number(item.dataset.itemIndex),box.top-rect.top,box.height];
        });
        const list=el.querySelector('[data-testid="virtuoso-item-list"]');
        record({type:'frame',id,t:performance.now(),wheelTime:lastWheel,delta,top:el.scrollTop,height:el.scrollHeight,viewport:el.clientHeight,items,listStyle:list?.getAttribute('style'),listHeight:list?.getBoundingClientRect().height,anchor:getComputedStyle(el).overflowAnchor});
        if(el.isConnected && performance.now()-lastWheel<2200)requestAnimationFrame(sample);
        else running=false;
      };
      el.addEventListener('wheel',event=>{
        lastWheel=performance.now();delta=event.deltaY;
        record({type:'wheel',id,t:lastWheel,delta,mode:event.deltaMode});
        if(!running){running=true;requestAnimationFrame(sample);}
      },{passive:true});
      const rect=el.getBoundingClientRect();
      record({type:'attached',id,anchor:getComputedStyle(el).overflowAnchor,overscroll:getComputedStyle(el).overscrollBehavior,viewport:[rect.width,rect.height]});
    }
  };
  setInterval(attach,750);
  setInterval(()=>{
    if(events.length)fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(events.splice(0)),keepalive:true}).catch(()=>{});
  },1000);
  attach();
})();
