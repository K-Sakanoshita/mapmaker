// Synthetic, immutable OSM features placed at each documented test center.
// These are test geometry, not a snapshot of the real places.
module.exports = ([lon,lat]) => {
 const elements=[];let serial=1;
 const node=(x,y,tags)=>{const id=serial++;elements.push({type:'node',id,lon:lon+x,lat:lat+y,...(tags?{tags}:{})});return id;};
 const way=(points,tags,closed=false)=>{const nodes=points.map(([x,y])=>node(x,y));if(closed)nodes.push(nodes[0]);const id=serial++;elements.push({type:'way',id,nodes,tags});return id;};
 for(let i=0;i<6;i++)way([[i*.00025-.0008,-.0005],[i*.00025-.0006,-.0005],[i*.00025-.0006,-.0001],[i*.00025-.0008,-.0001]],{...(i===3?{'building:part':'yes'}:{building:'yes'}),height:String(8+i*4),name:`建物${i}`,...(i<4?{'roof:shape':['gabled','hipped','pyramidal','gabled'][i],'roof:height':'3'}:{})},true);
 way([[-.001,.0005],[.001,.0005]],{highway:'residential',name:'テスト道路'});
 way([[-.001,-.001],[.001,-.001],[.001,-.0007],[-.001,-.0007]],{natural:'water'},true);
 way([[-.0005,.0001],[.0005,.0001],[.0005,.0004],[-.0005,.0004]],{leisure:'park'},true);
 way([[-.0005,0],[.0005,0]],{barrier:'wall',height:'2'});
 way([[-.0005,.00002],[.0005,.00002]],{barrier:'rope',height:'1.2',name:'Rope barrier'});
 way([[-.0005,.00045],[.0005,.00045]],{barrier:'hedge',height:'1'});
 way([[.00022,.00022],[.00025,.00025],[.00022,.00028],[.00019,.00025]],{barrier:'fence',name:'Small fence'},true);
 way([[-.0005,.00008],[.0005,.00008],[.0005,.0004]],{barrier:'fence',height:'2.4',name:'Chain-link fence'});
 way([[-.0009,.0006],[-.0005,.0006],[-.0005,.0009]],{barrier:'retaining_wall',height:'4',name:'Retaining wall'});
 node(0,.00025,{natural:'tree',height:'5'});
 node(.0003,.0006,{amenity:'cafe',name:'珈琲 & <テスト>', 'name:en':'Cafe & Test'});
 const outline=way([[.0006,.00005],[.0011,.00005],[.0011,.0005],[.0006,.0005]],{building:'yes',height:'30',name:'Parts outline'},true);
 const lower=way([[.0006,.00005],[.00085,.00005],[.00085,.0005],[.0006,.0005]],{'building:part':'yes',height:'6',name:'Lower part'},true);
 const upper=way([[.00085,.00005],[.0012,.00005],[.0012,.0005],[.00085,.0005]],{'building:part':'yes',height:'14',min_height:'4',name:'Raised part'},true);
 elements.push({type:'relation',id:serial++,tags:{type:'building'},members:[{type:'way',ref:outline,role:'outline'},{type:'way',ref:lower,role:'part'},{type:'way',ref:upper,role:'part'}]});
 return {version:0.6,elements};
};
