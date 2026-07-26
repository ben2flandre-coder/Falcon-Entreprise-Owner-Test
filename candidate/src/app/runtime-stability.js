(function installFalconRuntimeStability(){
  'use strict';
  if(window.FalconRuntimeStability) return;

  var THEME_KEY='falcon.enterprise.theme';
  var ACTION_TIMEOUT_MS=15000;

  function safeStorage(){
    try{
      var probe='__falcon_theme_probe__';
      localStorage.setItem(probe,'1');
      localStorage.removeItem(probe);
      return localStorage;
    }catch(e){return null;}
  }

  function normalizeTheme(value){return value==='light'?'light':'dark';}

  function readTheme(){
    var store=safeStorage();
    if(store){
      var saved=store.getItem(THEME_KEY);
      if(saved==='light'||saved==='dark') return saved;
    }
    var attr=document.documentElement.getAttribute('data-theme');
    return normalizeTheme(attr);
  }

  function applyTheme(value, options){
    var theme=normalizeTheme(value);
    document.documentElement.setAttribute('data-theme',theme);
    if(document.body) document.body.setAttribute('data-theme',theme);
    if(!options||options.persist!==false){
      var store=safeStorage();
      if(store) store.setItem(THEME_KEY,theme);
    }
    document.dispatchEvent(new CustomEvent('falcon:theme-changed',{detail:{theme:theme}}));
    return theme;
  }

  function toggleTheme(){return applyTheme(readTheme()==='light'?'dark':'light');}

  function installThemePersistence(){
    applyTheme(readTheme(),{persist:false});
    var observer=new MutationObserver(function(){
      var expected=readTheme();
      var htmlTheme=document.documentElement.getAttribute('data-theme');
      var bodyTheme=document.body&&document.body.getAttribute('data-theme');
      if(htmlTheme!==expected||bodyTheme!==expected) applyTheme(expected,{persist:false});
    });
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    if(document.body) observer.observe(document.body,{attributes:true,attributeFilter:['data-theme']});
    document.addEventListener('click',function(event){
      var trigger=event.target&&event.target.closest&&event.target.closest('[data-falcon-theme-toggle],.theme-btn,#themeToggle,#theme-toggle');
      if(!trigger) return;
      event.preventDefault();
      toggleTheme();
    },true);
  }

  function status(message,type){
    document.dispatchEvent(new CustomEvent('falcon:operation-status',{detail:{message:String(message||''),type:type||'info'}}));
    try{if(typeof window.toast==='function') window.toast(message,type==='error'?'warn':type==='success'?'ok':'info');}catch(e){}
  }

  function withRecovery(label,operation){
    var settled=false;
    var timer=setTimeout(function(){
      if(settled) return;
      settled=true;
      status(label+' : délai dépassé. L’interface reste disponible et l’action peut être relancée.','error');
    },ACTION_TIMEOUT_MS);
    try{
      var result=operation();
      if(result&&typeof result.then==='function'){
        return result.then(function(value){
          if(!settled){settled=true;clearTimeout(timer);status(label+' terminé.','success');}
          return value;
        }).catch(function(error){
          if(!settled){settled=true;clearTimeout(timer);status(label+' impossible : '+String(error&&error.message||error),'error');}
          return null;
        });
      }
      settled=true;clearTimeout(timer);status(label+' préparé.','success');return result;
    }catch(error){
      settled=true;clearTimeout(timer);status(label+' impossible : '+String(error&&error.message||error),'error');return null;
    }
  }

  function installOperationGuard(){
    document.addEventListener('click',function(event){
      var trigger=event.target&&event.target.closest&&event.target.closest('[data-falcon-operation],button');
      if(!trigger) return;
      var label=String(trigger.textContent||'').trim();
      var operation=trigger.getAttribute('data-falcon-operation')||'';
      if(!operation&&!/(imprimer|plein écran|application compatible|espace connecté|envoyer par mail|partager|sauvegarder|exporter)/i.test(label)) return;
      trigger.setAttribute('aria-busy','true');
      setTimeout(function(){trigger.removeAttribute('aria-busy');},ACTION_TIMEOUT_MS);
      window.setTimeout(function(){
        try{document.body.style.pointerEvents='';document.documentElement.style.pointerEvents='';}catch(e){}
      },0);
    },true);

    window.addEventListener('error',function(event){
      status('Erreur récupérable : '+String(event.message||'opération interrompue')+'.','error');
      try{document.body.style.pointerEvents='';document.documentElement.style.pointerEvents='';}catch(e){}
    });
    window.addEventListener('unhandledrejection',function(event){
      status('Opération interrompue : '+String(event.reason&&event.reason.message||event.reason||'erreur')+'.','error');
      try{document.body.style.pointerEvents='';document.documentElement.style.pointerEvents='';}catch(e){}
    });
  }

  function install(){installThemePersistence();installOperationGuard();}

  window.FalconRuntimeStability={
    version:'EI-16-R8-P0',
    readTheme:readTheme,
    applyTheme:applyTheme,
    toggleTheme:toggleTheme,
    withRecovery:withRecovery,
    install:install
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
