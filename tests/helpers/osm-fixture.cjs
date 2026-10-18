// Synthetic, immutable OSM features placed at each documented test center.
// These are test geometry, not a snapshot of the real places.
module.exports = ([lon,lat]) => {
 const elements=[];let serial=1;
 const node=(x,y,tags)=>{const id=serial++;elements.push({type:'node',id,lon:lon+x,lat:lat+y,...(tags?{tags}:{})});return id;};
 const way=(points,tags,closed=false)=>{const nodes=points.map(([x,y])=>node(x,y));if(closed)nodes.push(nodes[0]);elements.push({type:'way',id:serial++,nodes,tags});};
 for(let i=0;i<6;i++)way([[i*.00025-.0008,-.0005],[i*.00025-.0006,-.0005],[i*.00025-.0006,-.0001],[i*.00025-.0008,-.0001]],{building:'yes',height:String(8+i*4),name:`建物${i}`},true);
 way([[-.001,.0005],[.001,.0005]],{highway:'residential',name:'テスト道路'});
 way([[-.001,-.001],[.001,-.001],[.001,-.0007],[-.001,-.0007]],{natural:'water'},true);
 way([[-.0005,.0001],[.0005,.0001],[.0005,.0004],[-.0005,.0004]],{leisure:'park'},true);
 way([[-.0005,0],[.0005,0]],{barrier:'wall',height:'2'});
 way([[-.0005,.00045],[.0005,.00045]],{barrier:'hedge',height:'1'});
 node(0,.00025,{natural:'tree',height:'5'});
 node(.0003,.0006,{amenity:'cafe',name:'珈琲 & <テスト>', 'name:en':'Cafe & Test'});
 return {version:0.6,elements};
};
