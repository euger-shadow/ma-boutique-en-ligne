'use strict';

async function loadFeaturedStores(){
  const box=document.getElementById('featuredStores');
  const section=document.getElementById('featuredSection');
  if(!box||!section||typeof db==='undefined'||!db)return;
  try{
    const res=await db.from('stores')
      .select('slug,name,description,city,country')
      .order('created_at',{ascending:false})
      .limit(4);
    if(res.error||!res.data||!res.data.length)return;
    box.innerHTML=res.data.map(function(s){
      return '<article class="panel feat">'
        +'<h3>'+escapeHTML(s.name)+'</h3>'
        +'<p class="muted">'+escapeHTML(s.description||'')+'</p>'
        +'<p>'+escapeHTML([s.city,s.country].filter(Boolean).join(', '))+'</p>'
        +'<button class="secondary small" data-action="open-store" data-slug="'+escapeHTML(s.slug)+'">Voir la boutique</button>'
        +'</article>';
    }).join('');
    section.classList.remove('hidden');
  }catch(err){}
}
loadFeaturedStores();
