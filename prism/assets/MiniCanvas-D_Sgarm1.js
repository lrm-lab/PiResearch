import{a as e,n as t,t as n}from"./jsx-runtime-Wy9s6hX0.js";import{d as r,f as i,g as a,h as o,i as s,l as c,m as l,p as u,r as d,t as f,u as p}from"./index-BC-XXy60.js";import{At as m,E as h,Ft as g,G as _,H as v,I as y,It as b,K as ee,M as te,Pt as ne,Rt as re,U as x,_ as S,bt as C,ct as ie,d as w,et as T,f as ae,i as oe,l as E,n as se,nt as ce,o as le,p as ue,r as D,s as de,t as fe,tt as pe,v as me,w as O,wt as he,yt as ge}from"./Fbo-CvAHN_tK.js";var _e=se>=125?`uv1`:`uv2`,ve=new S,k=new g,A=class extends v{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type=`LineSegmentsGeometry`,this.setIndex([0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5]),this.setAttribute(`position`,new y([-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],3)),this.setAttribute(`uv`,new y([-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],2))}applyMatrix4(e){let t=this.attributes.instanceStart,n=this.attributes.instanceEnd;return t!==void 0&&(t.applyMatrix4(e),n.applyMatrix4(e),t.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let n=new x(t,6,1);return this.setAttribute(`instanceStart`,new _(n,3,0)),this.setAttribute(`instanceEnd`,new _(n,3,3)),this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(e,t=3){let n;e instanceof Float32Array?n=e:Array.isArray(e)&&(n=new Float32Array(e));let r=new x(n,t*2,1);return this.setAttribute(`instanceColorStart`,new _(r,t,0)),this.setAttribute(`instanceColorEnd`,new _(r,t,t)),this}fromWireframeGeometry(e){return this.setPositions(e.attributes.position.array),this}fromEdgesGeometry(e){return this.setPositions(e.attributes.position.array),this}fromMesh(e){return this.fromWireframeGeometry(new re(e.geometry)),this}fromLineSegments(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new S);let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;e!==void 0&&t!==void 0&&(this.boundingBox.setFromBufferAttribute(e),ve.setFromBufferAttribute(t),this.boundingBox.union(ve))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new he),this.boundingBox===null&&this.computeBoundingBox();let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;if(e!==void 0&&t!==void 0){let n=this.boundingSphere.center;this.boundingBox.getCenter(n);let r=0;for(let i=0,a=e.count;i<a;i++)k.fromBufferAttribute(e,i),r=Math.max(r,n.distanceToSquared(k)),k.fromBufferAttribute(t,i),r=Math.max(r,n.distanceToSquared(k));this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&console.error(`THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.`,this)}}toJSON(){}applyMatrix(e){return console.warn(`THREE.LineSegmentsGeometry: applyMatrix() has been renamed to applyMatrix4().`),this.applyMatrix4(e)}},ye=class extends A{constructor(){super(),this.isLineGeometry=!0,this.type=`LineGeometry`}setPositions(e){let t=e.length-3,n=new Float32Array(2*t);for(let r=0;r<t;r+=3)n[2*r]=e[r],n[2*r+1]=e[r+1],n[2*r+2]=e[r+2],n[2*r+3]=e[r+3],n[2*r+4]=e[r+4],n[2*r+5]=e[r+5];return super.setPositions(n),this}setColors(e,t=3){let n=e.length-t,r=new Float32Array(2*n);if(t===3)for(let i=0;i<n;i+=t)r[2*i]=e[i],r[2*i+1]=e[i+1],r[2*i+2]=e[i+2],r[2*i+3]=e[i+3],r[2*i+4]=e[i+4],r[2*i+5]=e[i+5];else for(let i=0;i<n;i+=t)r[2*i]=e[i],r[2*i+1]=e[i+1],r[2*i+2]=e[i+2],r[2*i+3]=e[i+3],r[2*i+4]=e[i+4],r[2*i+5]=e[i+5],r[2*i+6]=e[i+6],r[2*i+7]=e[i+7];return super.setColors(r,t),this}fromLine(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}},be=class extends C{constructor(e){super({type:`LineMaterial`,uniforms:m.clone(m.merge([ue.common,ue.fog,{worldUnits:{value:1},linewidth:{value:1},resolution:{value:new ne(1,1)},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}}])),vertexShader:`
				#include <common>
				#include <fog_pars_vertex>
				#include <logdepthbuf_pars_vertex>
				#include <clipping_planes_pars_vertex>

				uniform float linewidth;
				uniform vec2 resolution;

				attribute vec3 instanceStart;
				attribute vec3 instanceEnd;

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
						attribute vec4 instanceColorStart;
						attribute vec4 instanceColorEnd;
					#else
						varying vec3 vLineColor;
						attribute vec3 instanceColorStart;
						attribute vec3 instanceColorEnd;
					#endif
				#endif

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#ifdef USE_DASH

					uniform float dashScale;
					attribute float instanceDistanceStart;
					attribute float instanceDistanceEnd;
					varying float vLineDistance;

				#endif

				void trimSegment( const in vec4 start, inout vec4 end ) {

					// trim end segment so it terminates between the camera plane and the near plane

					// conservative estimate of the near plane
					float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
					float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
					float nearEstimate = - 0.5 * b / a;

					float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

					end.xyz = mix( start.xyz, end.xyz, alpha );

				}

				void main() {

					#ifdef USE_COLOR

						vLineColor = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

					#endif

					#ifdef USE_DASH

						vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
						vUv = uv;

					#endif

					float aspect = resolution.x / resolution.y;

					// camera space
					vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
					vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

					#ifdef WORLD_UNITS

						worldStart = start.xyz;
						worldEnd = end.xyz;

					#else

						vUv = uv;

					#endif

					// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
					// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
					// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
					// perhaps there is a more elegant solution -- WestLangley

					bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

					if ( perspective ) {

						if ( start.z < 0.0 && end.z >= 0.0 ) {

							trimSegment( start, end );

						} else if ( end.z < 0.0 && start.z >= 0.0 ) {

							trimSegment( end, start );

						}

					}

					// clip space
					vec4 clipStart = projectionMatrix * start;
					vec4 clipEnd = projectionMatrix * end;

					// ndc space
					vec3 ndcStart = clipStart.xyz / clipStart.w;
					vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

					// direction
					vec2 dir = ndcEnd.xy - ndcStart.xy;

					// account for clip-space aspect ratio
					dir.x *= aspect;
					dir = normalize( dir );

					#ifdef WORLD_UNITS

						// get the offset direction as perpendicular to the view vector
						vec3 worldDir = normalize( end.xyz - start.xyz );
						vec3 offset;
						if ( position.y < 0.5 ) {

							offset = normalize( cross( start.xyz, worldDir ) );

						} else {

							offset = normalize( cross( end.xyz, worldDir ) );

						}

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						float forwardOffset = dot( worldDir, vec3( 0.0, 0.0, 1.0 ) );

						// don't extend the line if we're rendering dashes because we
						// won't be rendering the endcaps
						#ifndef USE_DASH

							// extend the line bounds to encompass  endcaps
							start.xyz += - worldDir * linewidth * 0.5;
							end.xyz += worldDir * linewidth * 0.5;

							// shift the position of the quad so it hugs the forward edge of the line
							offset.xy -= dir * forwardOffset;
							offset.z += 0.5;

						#endif

						// endcaps
						if ( position.y > 1.0 || position.y < 0.0 ) {

							offset.xy += dir * 2.0 * forwardOffset;

						}

						// adjust for linewidth
						offset *= linewidth * 0.5;

						// set the world position
						worldPos = ( position.y < 0.5 ) ? start : end;
						worldPos.xyz += offset;

						// project the worldpos
						vec4 clip = projectionMatrix * worldPos;

						// shift the depth of the projected points so the line
						// segments overlap neatly
						vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
						clip.z = clipPose.z * clip.w;

					#else

						vec2 offset = vec2( dir.y, - dir.x );
						// undo aspect ratio adjustment
						dir.x /= aspect;
						offset.x /= aspect;

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						// endcaps
						if ( position.y < 0.0 ) {

							offset += - dir;

						} else if ( position.y > 1.0 ) {

							offset += dir;

						}

						// adjust for linewidth
						offset *= linewidth;

						// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
						offset /= resolution.y;

						// select end
						vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

						// back to clip space
						offset *= clip.w;

						clip.xy += offset;

					#endif

					gl_Position = clip;

					vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

					#include <logdepthbuf_vertex>
					#include <clipping_planes_vertex>
					#include <fog_vertex>

				}
			`,fragmentShader:`
				uniform vec3 diffuse;
				uniform float opacity;
				uniform float linewidth;

				#ifdef USE_DASH

					uniform float dashOffset;
					uniform float dashSize;
					uniform float gapSize;

				#endif

				varying float vLineDistance;

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#include <common>
				#include <fog_pars_fragment>
				#include <logdepthbuf_pars_fragment>
				#include <clipping_planes_pars_fragment>

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
					#else
						varying vec3 vLineColor;
					#endif
				#endif

				vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

					float mua;
					float mub;

					vec3 p13 = p1 - p3;
					vec3 p43 = p4 - p3;

					vec3 p21 = p2 - p1;

					float d1343 = dot( p13, p43 );
					float d4321 = dot( p43, p21 );
					float d1321 = dot( p13, p21 );
					float d4343 = dot( p43, p43 );
					float d2121 = dot( p21, p21 );

					float denom = d2121 * d4343 - d4321 * d4321;

					float numer = d1343 * d4321 - d1321 * d4343;

					mua = numer / denom;
					mua = clamp( mua, 0.0, 1.0 );
					mub = ( d1343 + d4321 * ( mua ) ) / d4343;
					mub = clamp( mub, 0.0, 1.0 );

					return vec2( mua, mub );

				}

				void main() {

					#include <clipping_planes_fragment>

					#ifdef USE_DASH

						if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

						if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

					#endif

					float alpha = opacity;

					#ifdef WORLD_UNITS

						// Find the closest points on the view ray and the line segment
						vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
						vec3 lineDir = worldEnd - worldStart;
						vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

						vec3 p1 = worldStart + lineDir * params.x;
						vec3 p2 = rayEnd * params.y;
						vec3 delta = p1 - p2;
						float len = length( delta );
						float norm = len / linewidth;

						#ifndef USE_DASH

							#ifdef USE_ALPHA_TO_COVERAGE

								float dnorm = fwidth( norm );
								alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

							#else

								if ( norm > 0.5 ) {

									discard;

								}

							#endif

						#endif

					#else

						#ifdef USE_ALPHA_TO_COVERAGE

							// artifacts appear on some hardware if a derivative is taken within a conditional
							float a = vUv.x;
							float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
							float len2 = a * a + b * b;
							float dlen = fwidth( len2 );

							if ( abs( vUv.y ) > 1.0 ) {

								alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

							}

						#else

							if ( abs( vUv.y ) > 1.0 ) {

								float a = vUv.x;
								float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
								float len2 = a * a + b * b;

								if ( len2 > 1.0 ) discard;

							}

						#endif

					#endif

					vec4 diffuseColor = vec4( diffuse, alpha );
					#ifdef USE_COLOR
						#ifdef USE_LINE_COLOR_ALPHA
							diffuseColor *= vLineColor;
						#else
							diffuseColor.rgb *= vLineColor;
						#endif
					#endif

					#include <logdepthbuf_fragment>

					gl_FragColor = diffuseColor;

					#include <tonemapping_fragment>
					#include <${se>=154?`colorspace_fragment`:`encodings_fragment`}>
					#include <fog_fragment>
					#include <premultiplied_alpha_fragment>

				}
			`,clipping:!0}),this.isLineMaterial=!0,this.onBeforeCompile=function(){this.transparent?this.defines.USE_LINE_COLOR_ALPHA=`1`:delete this.defines.USE_LINE_COLOR_ALPHA},Object.defineProperties(this,{color:{enumerable:!0,get:function(){return this.uniforms.diffuse.value},set:function(e){this.uniforms.diffuse.value=e}},worldUnits:{enumerable:!0,get:function(){return`WORLD_UNITS`in this.defines},set:function(e){e===!0?this.defines.WORLD_UNITS=``:delete this.defines.WORLD_UNITS}},linewidth:{enumerable:!0,get:function(){return this.uniforms.linewidth.value},set:function(e){this.uniforms.linewidth.value=e}},dashed:{enumerable:!0,get:function(){return`USE_DASH`in this.defines},set(e){!!e!=`USE_DASH`in this.defines&&(this.needsUpdate=!0),e===!0?this.defines.USE_DASH=``:delete this.defines.USE_DASH}},dashScale:{enumerable:!0,get:function(){return this.uniforms.dashScale.value},set:function(e){this.uniforms.dashScale.value=e}},dashSize:{enumerable:!0,get:function(){return this.uniforms.dashSize.value},set:function(e){this.uniforms.dashSize.value=e}},dashOffset:{enumerable:!0,get:function(){return this.uniforms.dashOffset.value},set:function(e){this.uniforms.dashOffset.value=e}},gapSize:{enumerable:!0,get:function(){return this.uniforms.gapSize.value},set:function(e){this.uniforms.gapSize.value=e}},opacity:{enumerable:!0,get:function(){return this.uniforms.opacity.value},set:function(e){this.uniforms.opacity.value=e}},resolution:{enumerable:!0,get:function(){return this.uniforms.resolution.value},set:function(e){this.uniforms.resolution.value.copy(e)}},alphaToCoverage:{enumerable:!0,get:function(){return`USE_ALPHA_TO_COVERAGE`in this.defines},set:function(e){!!e!=`USE_ALPHA_TO_COVERAGE`in this.defines&&(this.needsUpdate=!0),e===!0?(this.defines.USE_ALPHA_TO_COVERAGE=``,this.extensions.derivatives=!0):(delete this.defines.USE_ALPHA_TO_COVERAGE,this.extensions.derivatives=!1)}}}),this.setValues(e)}},xe=new b,Se=new g,Ce=new g,j=new b,M=new b,N=new b,P=new g,F=new pe,I=new ee,we=new g,L=new S,R=new he,z=new b,B,V;function Te(e,t,n){return z.set(0,0,-t,1).applyMatrix4(e.projectionMatrix),z.multiplyScalar(1/z.w),z.x=V/n.width,z.y=V/n.height,z.applyMatrix4(e.projectionMatrixInverse),z.multiplyScalar(1/z.w),Math.abs(Math.max(z.x,z.y))}function Ee(e,t){let n=e.matrixWorld,r=e.geometry,i=r.attributes.instanceStart,a=r.attributes.instanceEnd,o=Math.min(r.instanceCount,i.count);for(let r=0,s=o;r<s;r++){I.start.fromBufferAttribute(i,r),I.end.fromBufferAttribute(a,r),I.applyMatrix4(n);let o=new g,s=new g;B.distanceSqToSegment(I.start,I.end,s,o),s.distanceTo(o)<V*.5&&t.push({point:s,pointOnLine:o,distance:B.origin.distanceTo(s),object:e,face:null,faceIndex:r,uv:null,[_e]:null})}}function De(e,t,n){let r=t.projectionMatrix,i=e.material.resolution,a=e.matrixWorld,o=e.geometry,s=o.attributes.instanceStart,c=o.attributes.instanceEnd,l=Math.min(o.instanceCount,s.count),u=-t.near;B.at(1,N),N.w=1,N.applyMatrix4(t.matrixWorldInverse),N.applyMatrix4(r),N.multiplyScalar(1/N.w),N.x*=i.x/2,N.y*=i.y/2,N.z=0,P.copy(N),F.multiplyMatrices(t.matrixWorldInverse,a);for(let t=0,o=l;t<o;t++){if(j.fromBufferAttribute(s,t),M.fromBufferAttribute(c,t),j.w=1,M.w=1,j.applyMatrix4(F),M.applyMatrix4(F),j.z>u&&M.z>u)continue;if(j.z>u){let e=j.z-M.z,t=(j.z-u)/e;j.lerp(M,t)}else if(M.z>u){let e=M.z-j.z,t=(M.z-u)/e;M.lerp(j,t)}j.applyMatrix4(r),M.applyMatrix4(r),j.multiplyScalar(1/j.w),M.multiplyScalar(1/M.w),j.x*=i.x/2,j.y*=i.y/2,M.x*=i.x/2,M.y*=i.y/2,I.start.copy(j),I.start.z=0,I.end.copy(M),I.end.z=0;let o=I.closestPointToPointParameter(P,!0);I.at(o,we);let l=T.lerp(j.z,M.z,o),d=l>=-1&&l<=1,f=P.distanceTo(we)<V*.5;if(d&&f){I.start.fromBufferAttribute(s,t),I.end.fromBufferAttribute(c,t),I.start.applyMatrix4(a),I.end.applyMatrix4(a);let r=new g,i=new g;B.distanceSqToSegment(I.start,I.end,i,r),n.push({point:i,pointOnLine:r,distance:B.origin.distanceTo(i),object:e,face:null,faceIndex:t,uv:null,[_e]:null})}}}var Oe=class extends ce{constructor(e=new A,t=new be({color:Math.random()*16777215})){super(e,t),this.isLineSegments2=!0,this.type=`LineSegments2`}computeLineDistances(){let e=this.geometry,t=e.attributes.instanceStart,n=e.attributes.instanceEnd,r=new Float32Array(2*t.count);for(let e=0,i=0,a=t.count;e<a;e++,i+=2)Se.fromBufferAttribute(t,e),Ce.fromBufferAttribute(n,e),r[i]=i===0?0:r[i-1],r[i+1]=r[i]+Se.distanceTo(Ce);let i=new x(r,2,1);return e.setAttribute(`instanceDistanceStart`,new _(i,1,0)),e.setAttribute(`instanceDistanceEnd`,new _(i,1,1)),this}raycast(e,t){let n=this.material.worldUnits,r=e.camera;r===null&&!n&&console.error(`LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.`);let i=e.params.Line2===void 0?0:e.params.Line2.threshold||0;B=e.ray;let a=this.matrixWorld,o=this.geometry,s=this.material;V=s.linewidth+i,o.boundingSphere===null&&o.computeBoundingSphere(),R.copy(o.boundingSphere).applyMatrix4(a);let c;if(c=n?V*.5:Te(r,Math.max(r.near,R.distanceToPoint(B.origin)),s.resolution),R.radius+=c,B.intersectsSphere(R)===!1)return;o.boundingBox===null&&o.computeBoundingBox(),L.copy(o.boundingBox).applyMatrix4(a);let l;l=n?V*.5:Te(r,Math.max(r.near,L.distanceToPoint(B.origin)),s.resolution),L.expandByScalar(l),B.intersectsBox(L)!==!1&&(n?Ee(this,t):De(this,r,t))}onBeforeRender(e){let t=this.material.uniforms;t&&t.resolution&&(e.getViewport(xe),this.material.uniforms.resolution.value.set(xe.z,xe.w))}},ke=class extends Oe{constructor(e=new ye,t=new be({color:Math.random()*16777215})){super(e,t),this.isLine2=!0,this.type=`Line2`}},H=e(t()),Ae=H.forwardRef(function({points:e,color:t=16777215,vertexColors:n,linewidth:r,lineWidth:i,segments:a,dashed:o,...s},c){var l;let u=w(e=>e.size),d=H.useMemo(()=>a?new Oe:new ke,[a]),[f]=H.useState(()=>new be),p=(n==null||(l=n[0])==null?void 0:l.length)===4?4:3,m=H.useMemo(()=>{let r=a?new A:new ye,i=e.map(e=>{let t=Array.isArray(e);return e instanceof g||e instanceof b?[e.x,e.y,e.z]:e instanceof ne?[e.x,e.y,0]:t&&e.length===3?[e[0],e[1],e[2]]:t&&e.length===2?[e[0],e[1],0]:e});if(r.setPositions(i.flat()),n){t=16777215;let e=n.map(e=>e instanceof O?e.toArray():e);r.setColors(e.flat(),p)}return r},[e,a,n,p]);return H.useLayoutEffect(()=>{d.computeLineDistances()},[e,d]),H.useLayoutEffect(()=>{o?f.defines.USE_DASH=``:delete f.defines.USE_DASH,f.needsUpdate=!0},[o,f]),H.useEffect(()=>()=>{m.dispose(),f.dispose()},[m]),H.createElement(`primitive`,D({object:d,ref:c},s),H.createElement(`primitive`,{object:m,attach:`geometry`}),H.createElement(`primitive`,D({object:f,attach:`material`,color:t,vertexColors:!!n,resolution:[u.width,u.height],linewidth:r??i??1,dashed:o,transparent:p===4},s)))}),je=e=>typeof e==`function`,Me=H.forwardRef(({envMap:e,resolution:t=256,frames:n=1/0,makeDefault:r,children:i,...a},o)=>{let s=w(({set:e})=>e),c=w(({camera:e})=>e),l=w(({size:e})=>e),u=H.useRef(null);H.useImperativeHandle(o,()=>u.current,[]);let d=H.useRef(null),f=fe(t);H.useLayoutEffect(()=>{a.manual||(u.current.aspect=l.width/l.height)},[l,a]),H.useLayoutEffect(()=>{u.current.updateProjectionMatrix()});let p=0,m=null,h=je(i);return E(t=>{h&&(n===1/0||p<n)&&(d.current.visible=!1,t.gl.setRenderTarget(f),m=t.scene.background,e&&(t.scene.background=e),t.gl.render(t.scene,u.current),t.scene.background=m,t.gl.setRenderTarget(null),d.current.visible=!0,p++)}),H.useLayoutEffect(()=>{if(r){let e=c;return s(()=>({camera:u.current})),()=>s(()=>({camera:e}))}},[u,r,s]),H.createElement(H.Fragment,null,H.createElement(`perspectiveCamera`,D({ref:u},a),!h&&i),H.createElement(`group`,{ref:d},h&&i(f.texture)))}),Ne=e=>{let t,n=new Set,r=(e,r)=>{let i=typeof e==`function`?e(t):e;if(!Object.is(i,t)){let e=t;t=r??(typeof i!=`object`||!i)?i:Object.assign({},t,i),n.forEach(n=>n(t,e))}},i=()=>t,a={setState:r,getState:i,getInitialState:()=>o,subscribe:e=>(n.add(e),()=>n.delete(e)),destroy:()=>{n.clear()}},o=t=e(r,i,a);return a},Pe=e=>e?Ne(e):Ne,Fe=e(ae(),1),{useDebugValue:Ie}=H.default,{useSyncExternalStoreWithSelector:Le}=Fe.default,Re=e=>e;function ze(e,t=Re,n){let r=Le(e.subscribe,e.getState,e.getServerState||e.getInitialState,t,n);return Ie(r),r}var Be=e=>{let t=typeof e==`function`?Pe(e):e,n=(e,n)=>ze(t,e,n);return Object.assign(n,t),n},Ve=e=>e?Be(e):Be,He,Ue=typeof window<`u`&&((He=window.document)!=null&&He.createElement||window.navigator?.product===`ReactNative`)?H.useLayoutEffect:H.useEffect;function We(){let e=Ve(e=>({current:[],version:0,set:e}));return{In:({children:t})=>{let n=e(e=>e.set),r=e(e=>e.version);return Ue(()=>{n(e=>({version:e.version+1}))},[]),Ue(()=>(n(({current:e})=>({current:[...e,t]})),()=>n(({current:e})=>({current:e.filter(e=>e!==t)}))),[t,r]),null},Out:()=>{let t=e(e=>e.current);return H.createElement(H.Fragment,null,t)}}}var Ge=e=>e&&e.isOrthographicCamera,Ke=new O,qe=We();function U(e,t){let{right:n,top:r,left:i,bottom:a,width:o,height:s}=t,c=t.bottom<0||r>e.height||n<0||t.left>e.width,l=e.top+e.height-a;return{position:{width:o,height:s,left:i-e.left,top:r,bottom:l,right:n},isOffscreen:c}}function W(e,{left:t,bottom:n,width:r,height:i}){let a,o=r/i;return Ge(e.camera)?e.camera.manual?e.camera.updateProjectionMatrix():(e.camera.left!==r/-2||e.camera.right!==r/2||e.camera.top!==i/2||e.camera.bottom!==i/-2)&&(Object.assign(e.camera,{left:r/-2,right:r/2,top:i/2,bottom:i/-2}),e.camera.updateProjectionMatrix()):e.camera.aspect!==o&&(e.camera.aspect=o,e.camera.updateProjectionMatrix()),a=e.gl.autoClear,e.gl.autoClear=!1,e.gl.setViewport(t,n,r,i),e.gl.setScissor(t,n,r,i),e.gl.setScissorTest(!0),a}function G(e,t){e.gl.setScissorTest(!1),e.gl.autoClear=t}function Je(e){e.gl.getClearColor(Ke),e.gl.setClearColor(Ke,e.gl.getClearAlpha()),e.gl.clear(!0,!0)}function Ye({visible:e=!0,canvasSize:t,scene:n,index:r,children:i,frames:a,rect:o,track:s}){let c=w(),[l,u]=H.useState(!1),d=0;return E(r=>{if((a===1/0||d<=a)&&(s&&(o.current=s.current?.getBoundingClientRect()),d++),o.current){let{position:a,isOffscreen:s}=U(t,o.current);if(l!==s&&u(s),e&&!l&&o.current){let e=W(r,a);r.gl.render(i?r.scene:n,r.camera),G(r,e)}}},r),H.useLayoutEffect(()=>{let n=o.current;if(n&&(!e||!l)){let{position:e}=U(t,n),r=W(c,e);Je(c),G(c,r)}},[e,l]),H.useEffect(()=>{if(!s)return;let e=o.current,n=c.get().events.connected;return c.setEvents({connected:s.current}),()=>{if(e){let{position:n}=U(t,e),r=W(c,n);Je(c),G(c,r)}c.setEvents({connected:n})}},[s]),H.createElement(H.Fragment,null,i,H.createElement(`group`,{onPointerOver:()=>null}))}var Xe=H.forwardRef(({track:e,visible:t=!0,index:n=1,id:r,style:i,className:a,frames:o=1/0,children:s,...c},l)=>{let u=H.useRef(null),{size:d,scene:f}=w(),[p]=H.useState(()=>new ge),[m,h]=H.useReducer(()=>!0,!1),g=H.useCallback((t,n)=>{if(u.current&&e&&e.current&&t.target===e.current){let{width:e,height:r,left:i,top:a}=u.current,o=t.clientX-i,s=t.clientY-a;n.pointer.set(o/e*2-1,-(s/r)*2+1),n.raycaster.setFromCamera(n.pointer,n.camera)}},[u,e]);return H.useEffect(()=>{e&&(u.current=e.current?.getBoundingClientRect()),h()},[e]),H.createElement(`group`,D({ref:l},c),m&&de(H.createElement(Ye,{visible:t,canvasSize:d,frames:o,scene:f,track:e,rect:u,index:n},s),p,{events:{compute:g,priority:n},size:{width:u.current?.width,height:u.current?.height,top:u.current?.top,left:u.current?.left}}))}),Ze=H.forwardRef(({as:e=`div`,id:t,visible:n,className:r,style:i,index:a=1,track:o,frames:s=1/0,children:c,...l},u)=>{let d=H.useId(),f=H.useRef(null);return H.useImperativeHandle(u,()=>f.current),H.createElement(H.Fragment,null,H.createElement(e,D({ref:f,id:t,className:r,style:i},l)),H.createElement(qe.In,null,H.createElement(Xe,{visible:n,key:d,track:f,frames:s,index:a},c)))}),Qe=(()=>{let e=H.forwardRef((e,t)=>H.useContext(le)?H.createElement(Xe,D({ref:t},e)):H.createElement(Ze,D({ref:t},e)));return e.Port=()=>H.createElement(qe.Out,null),e})(),$e={slabs:[],lines:[],goal:null,halfWidth:1.1,halfDepth:.8,outline:[[-1.1,-.8],[1.1,-.8],[-1.1,.8],[1.1,.8]]};function et(e){let t=/(\d+)$/.exec(e);return t?Number(t[1]):NaN}function tt(e,t){let n=et(e),r=et(t);return Number.isNaN(n)||Number.isNaN(r)||n===r?e<t?-1:+(e>t):n-r}function nt(e){if(!e||!e.ok||!e.nodes?.length)return $e;let t=e.nodes,n=1/0,r=1/0,i=-1/0,a=-1/0;for(let e of t)n=Math.min(n,e.x),r=Math.min(r,e.y),i=Math.max(i,e.x),a=Math.max(a,e.y);let o=4/Math.max(i-n,a-r,600),s=(n+i)/2,l=(r+a)/2,u=(e,t)=>[(e-s)*o,(t-l)*o],d=new Set(e.edges.filter(e=>e.relation===`error`).map(e=>e.to)),f=new Map(t.map(e=>[e.id,e])),p=new Map;for(let e of t){let n=1/0;for(let r of t)e!==r&&(n=Math.min(n,Math.hypot(e.x-r.x,e.y-r.y)*o));p.set(e.id,n)}let m=t.filter(e=>!e.goal).sort((e,t)=>tt(e.id,t.id)).map((e,t)=>{let[n,r]=u(e.x,e.y),i=Math.min(.8,Math.max(.12,Math.min((e.radius||48)*o*1.9,(p.get(e.id)??1/0)*.8)));return{id:e.id,x:n,z:r,w:i,d:i*.66,h:Math.min(.075,Math.max(.03,i*.15)),tone:c(e.status,d.has(e.id)),status:e.status,agentTone:e.tone,order:t}}),h=t.find(e=>e.goal)??null,g=h?(()=>{let[e,t]=u(h.x,h.y);return{x:e,z:t,size:Math.min(.36,Math.max(.2,(h.radius||72)*o*.9))}})():null,_=[];for(let t of e.edges){let e=f.get(t.from),n=f.get(t.to);e&&n&&e!==n&&_.push({from:u(e.x,e.y),to:u(n.x,n.y),relation:t.relation,fromGoal:e.goal,tone:n.tone})}let v=1.1,y=.8;for(let e of m)v=Math.max(v,Math.abs(e.x)+e.w/2),y=Math.max(y,Math.abs(e.z)+e.d/2);g&&(v=Math.max(v,Math.abs(g.x)+g.size),y=Math.max(y,Math.abs(g.z)+g.size));let b=[];for(let e of m)for(let t of[-.5,.5])for(let n of[-.5,.5])b.push([e.x+t*e.w,e.z+n*e.d]);if(g)for(let e=0;e<6;e+=1){let t=e/6*Math.PI*2;b.push([g.x+Math.cos(t)*g.size*1.6,g.z+Math.sin(t)*g.size*1.6])}return m.length<3&&b.push([-1.1,-.8],[1.1,-.8],[-1.1,.8],[1.1,.8]),{slabs:m,lines:_,goal:g,halfWidth:v,halfDepth:y,outline:b}}var rt=.04;function it(e,t,n,r,i=0,a=.9,o=.2){let s=Math.tan(n/2*Math.PI/180),c=Math.max(.4,t||1),l=Math.cos(i),u=Math.sin(i),d=[],f=e.length?e:[[-.3,-.3],[.3,.3]];for(let[e,t]of f){let n=e*l+t*u,r=-e*u+t*l;d.push([n,0,r],[n,o,r])}let p=e=>{let t=[0,Math.cos(r)*e,Math.sin(r)*e],n=-t[0],i=rt-t[1],o=-t[2],l=Math.hypot(n,i,o);n/=l,i/=l,o/=l;let u=-o,f=n,p=Math.hypot(u,f)||1;u/=p,f/=p;let m=-f*i,h=f*n-u*o,g=u*i;for(let[e,r,l]of d){let d=e-t[0],p=r-t[1],_=l-t[2],v=d*n+p*i+_*o;if(v<=.05)return!1;let y=(d*u+_*f)/(v*s*c),b=(d*m+p*h+_*g)/(v*s);if(Math.abs(y)>a||Math.abs(b)>a)return!1}return!0},m=.5,h=60;for(let e=0;e<28;e+=1){let e=(m+h)/2;p(e)?h=e:m=e}return h}var K=new g;function q(e,t,n,r,i,a){let o=2*Math.PI*i/4,s=Math.max(a-2*i,0),c=Math.PI/4;K.copy(t),K[r]=0,K.normalize();let l=.5*o/(o+s),u=1-K.angleTo(e)/c;return Math.sign(K[n])===1?u*l:s/(o+s)+l+l*(1-u)}var at=class e extends me{constructor(e=1,t=1,n=1,r=2,i=.1){let a=r*2+1;if(i=Math.min(e/2,t/2,n/2,i),super(1,1,1,a,a,a),this.type=`RoundedBoxGeometry`,this.parameters={width:e,height:t,depth:n,segments:r,radius:i},a===1)return;let o=this.toNonIndexed();this.index=null,this.attributes.position=o.attributes.position,this.attributes.normal=o.attributes.normal,this.attributes.uv=o.attributes.uv;let s=new g,c=new g,l=new g(e,t,n).divideScalar(2).subScalar(i),u=this.attributes.position.array,d=this.attributes.normal.array,f=this.attributes.uv.array,p=u.length/6,m=new g,h=.5/a;for(let r=0,a=0;r<u.length;r+=3,a+=2)switch(s.fromArray(u,r),c.copy(s),c.x-=Math.sign(c.x)*h,c.y-=Math.sign(c.y)*h,c.z-=Math.sign(c.z)*h,c.normalize(),u[r+0]=l.x*Math.sign(s.x)+c.x*i,u[r+1]=l.y*Math.sign(s.y)+c.y*i,u[r+2]=l.z*Math.sign(s.z)+c.z*i,d[r+0]=c.x,d[r+1]=c.y,d[r+2]=c.z,Math.floor(r/p)){case 0:m.set(1,0,0),f[a+0]=q(m,c,`z`,`y`,i,n),f[a+1]=1-q(m,c,`y`,`z`,i,t);break;case 1:m.set(-1,0,0),f[a+0]=1-q(m,c,`z`,`y`,i,n),f[a+1]=1-q(m,c,`y`,`z`,i,t);break;case 2:m.set(0,1,0),f[a+0]=1-q(m,c,`x`,`z`,i,e),f[a+1]=q(m,c,`z`,`x`,i,n);break;case 3:m.set(0,-1,0),f[a+0]=1-q(m,c,`x`,`z`,i,e),f[a+1]=1-q(m,c,`z`,`x`,i,n);break;case 4:m.set(0,0,1),f[a+0]=1-q(m,c,`x`,`y`,i,e),f[a+1]=1-q(m,c,`y`,`x`,i,t);break;case 5:m.set(0,0,-1),f[a+0]=q(m,c,`x`,`y`,i,e),f[a+1]=1-q(m,c,`y`,`x`,i,t)}}static fromJSON(t){return new e(t.width,t.height,t.depth,t.segments,t.radius)}};function ot(){return new C({transparent:!0,depthWrite:!1,uniforms:{uGround:{value:new O},uTint:{value:new O},uDot:{value:new O},uRadius:{value:3},uTintStrength:{value:.8}},vertexShader:`
      varying vec2 vPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vPos = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,fragmentShader:`
      uniform vec3 uGround;
      uniform vec3 uTint;
      uniform vec3 uDot;
      uniform float uRadius;
      uniform float uTintStrength;
      varying vec2 vPos;
      void main() {
        float r = length(vPos);
        float fade = 1.0 - smoothstep(uRadius * 0.6, uRadius, r);
        vec2 cell = fract(vPos / 0.22) - 0.5;
        float d = length(cell);
        float aa = fwidth(d) * 1.25;
        float dotMask = 1.0 - smoothstep(0.085 - aa, 0.085 + aa, d);
        float tint = 1.0 - smoothstep(0.0, uRadius * 0.85, r);
        vec3 color = mix(uGround, uTint, tint * uTintStrength);
        color = mix(color, uDot, dotMask * 0.95);
        gl_FragColor = vec4(color, fade);
        #include <colorspace_fragment>
      }
    `})}function st(){return new C({transparent:!0,depthWrite:!1,uniforms:{uColor:{value:new O(0)},uOpacity:{value:.18}},vertexShader:`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,fragmentShader:`
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = clamp(length(p), 0.0, 1.0);
        float a = pow(clamp(1.0 - r, 0.0, 1.0), 1.6) * uOpacity;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }
    `})}function ct(){return new C({transparent:!0,depthWrite:!1,side:2,uniforms:{uTime:{value:0},uPulse:{value:0},uBody:{value:new O},uRim:{value:new O},uAlpha:{value:.42}},vertexShader:`
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = cameraPosition - world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,fragmentShader:`
      uniform float uTime;
      uniform float uPulse;
      uniform vec3 uBody;
      uniform vec3 uRim;
      uniform float uAlpha;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vWorld;
      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        float ndv = clamp(dot(n, normalize(vView)), 0.0, 1.0);
        float fresnel = pow(clamp(1.0 - ndv, 0.0, 1.0), 2.2);
        vec3 spectrum = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + ndv * 1.2 + vWorld.y * 2.0 + uTime * 0.07));
        vec3 color = mix(uBody, spectrum, 0.22 + 0.3 * fresnel);
        color = mix(color, uRim, fresnel * 0.75);
        color += uRim * uPulse * 0.35;
        float alpha = clamp(uAlpha + fresnel * 0.45 + uPulse * 0.12, 0.0, 1.0);
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `})}function lt(){return new C({transparent:!0,depthWrite:!1,uniforms:{uTime:{value:0},uStrength:{value:.3}},vertexShader:`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,fragmentShader:`
      uniform float uTime;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float angle = atan(p.y, p.x);
        vec3 hue = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + angle / 6.28318 + uTime * 0.03));
        float ring = smoothstep(0.25, 0.55, r) * (1.0 - smoothstep(0.55, 1.0, r));
        float a = pow(clamp(ring, 0.0, 1.0), 1.3) * uStrength;
        gl_FragColor = vec4(hue, a);
        #include <colorspace_fragment>
      }
    `})}var ut=null;function dt(){return ut??=new at(1,1,1,3,.22),ut}var J=null;function ft(){if(!J){let e=new h(.5,.5,1,3,1);e.translate(0,.5,0);let t=e.toNonIndexed();t.computeVertexNormals();let n=new te(e,30);e.dispose(),J={body:t,edges:n}}return J}var Y=n(),pt=30,X=.9,mt=.78,Z=.22,ht=.16,gt=.6,_t=.05,vt=1.1,Q={light:{sky:`#ffffff`,dot:`#d9deea`,parent:i.parent},dark:{sky:`#c9c3e6`,dot:`#2e2e33`,parent:`#4b5260`}},$=new ie,yt=new O,bt=new O(Q.light.sky),xt=new WeakMap;function St(e,t){let n=Math.round(t*50),r=xt.get(e);r||(r=new Map,xt.set(e,r));let i=r.get(n);return i===void 0&&(i=it(e.outline,n/50,pt,X,Z,.84),r.set(n,i)),i}function Ct(e){return 1+2.5*(e-1)**3+1.5*(e-1)**2}function wt(e,t,n,r){return T.lerp(e,t,1-Math.exp(-n*r))}function Tt({id:e,track:t,theme:n,reducedMotion:i}){let o=a(t=>t.thumbs[e]),s=a(t=>t.rows?.find(t=>t.id===e)?.status===`running`),c=(0,H.useMemo)(()=>nt(o),[o]),u=l[n],d=(0,H.useRef)(null),f=(0,H.useRef)(null),p=(0,H.useRef)({spin:Z,polar:X,distance:0,hot:0}),m=w(e=>e.invalidate);(0,H.useEffect)(()=>{if(i)return a.subscribe((t,n)=>{t.hovered===e!=(n.hovered===e)&&m()})},[e,m,i]),E((n,r)=>{let o=d.current,l=f.current;if(!o||!l)return;let u=Math.min(r,.05),m=p.current,h=a.getState().hovered===e,g=t.current.getBoundingClientRect(),_=g.height>0?g.width/g.height:1.6,v=St(c,_);if(i)m.spin=Z+(h?.45:0),m.polar=h?mt:X,m.distance=v*(h?.94:1);else{if(m.hot=wt(m.hot,+!!h,6,u),h)m.spin+=u*.5*m.hot;else{let e=Math.round((m.spin-Z)/(Math.PI*2)),t=s?Math.sin(n.clock.elapsedTime*.35)*.07:0;m.spin=wt(m.spin,Z+e*Math.PI*2+t,2.4,u)}m.polar=T.lerp(X,mt,m.hot),m.distance=m.distance===0?v:wt(m.distance,v*(1-.06*m.hot),5,u)}l.rotation.y=m.spin;let y=m.distance;o.position.set(0,Math.cos(m.polar)*y,Math.sin(m.polar)*y),o.lookAt(0,rt,0)});let h=Q[n].sky;return(0,Y.jsxs)(Y.Fragment,{children:[(0,Y.jsx)(Me,{ref:d,makeDefault:!0,fov:pt,near:.1,far:80,position:[0,5,5]}),(0,Y.jsx)(`hemisphereLight`,{args:[h,u.ground,n===`dark`?1.2:1.5]}),(0,Y.jsx)(`directionalLight`,{position:[-3,7,4],intensity:n===`dark`?1.5:1.7}),(0,Y.jsx)(`directionalLight`,{position:[4,3,-2],intensity:.35,color:r}),(0,Y.jsxs)(`group`,{ref:f,children:[(0,Y.jsx)(Et,{layout:c,theme:n}),(0,Y.jsx)(Dt,{layout:c,theme:n}),(0,Y.jsx)(kt,{layout:c,theme:n,reducedMotion:i}),(0,Y.jsx)(At,{layout:c,theme:n,running:s,reducedMotion:i})]})]})}function Et({layout:e,theme:t}){let n=(0,H.useMemo)(ot,[]);(0,H.useEffect)(()=>()=>n.dispose(),[n]);let r=l[t],i=Math.max(e.halfWidth,e.halfDepth)*1.45+1.1;return(0,H.useLayoutEffect)(()=>{n.uniforms.uGround.value.set(r.ground),n.uniforms.uTint.value.set(r.groundTint),n.uniforms.uDot.value.set(Q[t].dot),n.uniforms.uTintStrength.value=t===`dark`?.75:.9,n.uniforms.uRadius.value=i},[n,r,t,i]),(0,Y.jsx)(`mesh`,{"rotation-x":-Math.PI/2,material:n,renderOrder:-2,children:(0,Y.jsx)(`planeGeometry`,{args:[i*2.2,i*2.2]})})}function Dt({layout:e,theme:t}){let{points:n,colors:a}=(0,H.useMemo)(()=>{let n=[],a=[],s=Q[t].parent;for(let c of e.lines){n.push([c.from[0],.006,c.from[1]],[c.to[0],.006,c.to[1]]);let e=c.fromGoal?t===`dark`?r:p[300]:c.relation===`parent`?s:i[c.relation],l=c.fromGoal?o(c.tone):c.relation===`parent`?s:i[c.relation],u=yt.set(e);a.push([u.r,u.g,u.b]);let d=yt.set(l);a.push([d.r,d.g,d.b])}return{points:n,colors:a}},[e,t]);return n.length?(0,Y.jsx)(Ae,{points:n,vertexColors:a,segments:!0,lineWidth:1.15,transparent:!0,opacity:t===`dark`?.8:.78,depthWrite:!1,renderOrder:-1}):null}function Ot(e,t,n){return n.set(u[e.tone]),t===`light`&&n.lerp(bt,e.tone===`closed`?.25:.1),n}function kt({layout:e,theme:t,reducedMotion:n}){let r=(0,H.useRef)(null),i=(0,H.useRef)(null),a=(0,H.useRef)(null),o=dt(),s=(0,H.useMemo)(st,[]);(0,H.useEffect)(()=>()=>s.dispose(),[s]);let c=(0,H.useRef)(new Map),l=w(e=>e.clock),u=w(e=>e.invalidate),d=(0,H.useMemo)(()=>{let t=[],n=[];for(let r of e.slabs)(r.status===`open`?n:t).push(r);return{solidSlabs:t,ghostSlabs:n}},[e]),f=e.slabs.length;return(0,H.useLayoutEffect)(()=>{let t=l.elapsedTime,r=e.slabs.filter(e=>!c.current.has(e.id)),i=r.length>1?Math.min(_t,vt/r.length):0;r.forEach((e,r)=>c.current.set(e.id,n?-10:t+.12+r*i)),u()},[e,l,n,u]),(0,H.useLayoutEffect)(()=>{s.uniforms.uOpacity.value=t===`dark`?.55:.2;let e=(e,n)=>{e&&(n.forEach((n,r)=>e.setColorAt(r,Ot(n,t,yt))),e.instanceColor&&(e.instanceColor.needsUpdate=!0))};e(r.current,d.solidSlabs),e(i.current,d.ghostSlabs),u()},[d,t,s,u]),E(e=>{let t=e.clock.elapsedTime,o=!1,s=0,l=(e,r)=>{e&&(r.forEach((r,i)=>{let l=c.current.get(r.id)??-10,u=T.clamp((t-l)/gt,0,1);u<1&&(o=!0);let d=u<=0?0:Ct(u),f=0,p=0,m=0,h=0;if(r.tone===`progress`)f=ht+(n?0:Math.sin(t*2.1+r.order*.9)*.025),n||(o=!0);else if(r.tone===`closed`)f=-.018,p=.06,m=.1;else if(r.tone===`error`&&!n){let e=(t+r.order*.7)%3.4;e<.45&&(h=Math.sin(e*40)*.07*(1-e/.45)),o=!0}let g=u<=0?1e-4:Math.min(1,.35+d*.65);$.position.set(r.x,r.h/2+f+(1-d)*.9,r.z),$.rotation.set(p,h,m),$.scale.set(r.w*g,r.h*g,r.d*g),$.updateMatrix(),e.setMatrixAt(i,$.matrix);let _=a.current;if(_){let e=(1+Math.max(0,f+(1-d)*.9)*2.2)*Math.max(1e-4,d);$.position.set(r.x+.02,.003,r.z+.03),$.rotation.set(-Math.PI/2,0,0),$.scale.set(r.w*1.45*e,r.d*1.6*e,1),$.updateMatrix(),_.setMatrixAt(s,$.matrix),s+=1}}),e.instanceMatrix.needsUpdate=!0)};l(r.current,d.solidSlabs),l(i.current,d.ghostSlabs),a.current&&(a.current.instanceMatrix.needsUpdate=!0),o&&e.invalidate()}),f?(0,Y.jsxs)(Y.Fragment,{children:[(0,Y.jsx)(`instancedMesh`,{ref:a,args:[void 0,s,f],renderOrder:0,frustumCulled:!1,children:(0,Y.jsx)(`planeGeometry`,{args:[1,1]})},`shadow-${f}`),d.solidSlabs.length>0&&(0,Y.jsx)(`instancedMesh`,{ref:r,args:[o,void 0,d.solidSlabs.length],frustumCulled:!1,children:(0,Y.jsx)(`meshStandardMaterial`,{roughness:.55,metalness:0})},`solid-${d.solidSlabs.length}`),d.ghostSlabs.length>0&&(0,Y.jsx)(`instancedMesh`,{ref:i,args:[o,void 0,d.ghostSlabs.length],frustumCulled:!1,renderOrder:1,children:(0,Y.jsx)(`meshStandardMaterial`,{roughness:.4,metalness:0,transparent:!0,opacity:t===`dark`?.5:.42,depthWrite:!1})},`ghost-${d.ghostSlabs.length}`)]}):null}function At({layout:e,theme:t,running:n,reducedMotion:i}){let{body:a,edges:o}=ft(),s=(0,H.useMemo)(ct,[]),c=(0,H.useMemo)(lt,[]);(0,H.useEffect)(()=>()=>{s.dispose(),c.dispose()},[s,c]);let l=(0,H.useRef)(null),u=(0,H.useRef)(null),d=e.goal??{x:0,z:0,size:.34};(0,H.useLayoutEffect)(()=>{s.uniforms.uBody.value.set(t===`dark`?p[400]:p[200]),s.uniforms.uRim.value.set(t===`dark`?r:p[500]),s.uniforms.uAlpha.value=t===`dark`?.4:.5,c.uniforms.uStrength.value=t===`dark`?.3:.2},[s,c,t]),E(e=>{let t=l.current;if(!t)return;let r=e.clock.elapsedTime;u.current??=r;let a=i?1:T.clamp((r-u.current-.25)/.7,0,1),o=a<=0?1e-4:Ct(a);t.scale.setScalar(o),t.rotation.y=i?.5:.5+r*(n?.45:.18);let d=n&&!i?.5+.5*Math.sin(r*2.4):n?.4:0;s.uniforms.uTime.value=i?0:r,s.uniforms.uPulse.value=d,c.uniforms.uTime.value=i?0:r,a<1&&e.invalidate()});let f=d.size;return(0,Y.jsxs)(`group`,{position:[d.x,0,d.z],children:[(0,Y.jsx)(`mesh`,{"rotation-x":-Math.PI/2,"position-y":.004,material:c,renderOrder:-1,children:(0,Y.jsx)(`planeGeometry`,{args:[f*4.2,f*4.2]})}),(0,Y.jsx)(`group`,{ref:l,children:(0,Y.jsxs)(`group`,{scale:[f,f*1.35,f],children:[(0,Y.jsx)(`mesh`,{geometry:a,material:s,renderOrder:2}),(0,Y.jsx)(`lineSegments`,{geometry:o,renderOrder:3,children:(0,Y.jsx)(`lineBasicMaterial`,{color:t===`dark`?r:p[500],transparent:!0,opacity:t===`dark`?.85:.7})})]})})]})}function jt(){return E(({gl:e})=>{e.setScissorTest(!1),e.setClearColor(0,0),e.clear(!0,!0,!0)},0),null}function Mt(){let e=w(e=>e.get);return(0,H.useEffect)(()=>(d({invalidate:()=>e().invalidate(),snapshot:t=>Nt(e(),t)}),()=>d(null)),[e]),null}function Nt(e,t){e.advance(performance.now(),!0);let n=e.gl.domElement,r=n.getBoundingClientRect(),i=t.getBoundingClientRect();if(!i.width||!i.height||!r.width)return null;let a=n.width/r.width,o=document.createElement(`canvas`);o.width=Math.round(i.width*a),o.height=Math.round(i.height*a);let s=o.getContext(`2d`);return s?(s.drawImage(n,(i.left-r.left)*a,(i.top-r.top)*a,i.width*a,i.height*a,0,0,o.width,o.height),o):null}function Pt({reducedMotion:e}){let t=s(),n=f();return(0,Y.jsxs)(oe,{"aria-hidden":`true`,flat:!0,frameloop:e?`demand`:`always`,dpr:[1,1.75],gl:{alpha:!0,antialias:!0,powerPreference:`high-performance`},onCreated:({gl:e})=>{e.setClearColor(new O(0),0)},style:{position:`absolute`,inset:0,pointerEvents:`none`},children:[(0,Y.jsx)(jt,{}),(0,Y.jsx)(Mt,{}),t.map(t=>(0,Y.jsx)(Qe,{track:t.track,index:1,children:(0,Y.jsx)(Tt,{id:t.id,track:t.track,theme:n,reducedMotion:e})},t.id))]})}export{Pt as default};