#version 300 es

// Three.js r184 - Node System


// extensions


// precision

precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
precision highp samplerCube;
precision highp sampler2DArray;

precision highp usampler2D;
precision highp usampler3D;
precision highp usamplerCube;
precision highp usampler2DArray;

precision highp isampler2D;
precision highp isampler3D;
precision highp isamplerCube;
precision highp isampler2DArray;

precision highp sampler2DShadow;
precision highp sampler2DArrayShadow;
precision highp samplerCubeShadow;


// structs

layout( location = 0 ) out vec4 fragColor;



// uniforms

layout( std140 ) uniform object {
	vec4 color__r_5_;
	float thickness__r_5_;
	float softness__r_5_;
	vec2 nodeUniform3;
	vec4 nodeUniform4;
	vec2 position__r_5_;
	float angle__r_5_;
	float frequency__r_5_;
	float nodeUniform8;
	float amplitude__r_5_;
	float nodeUniform10;
	vec4 rayColor__r_4_;
	vec2 center__r_4_;
	float density__r_4_;
	float nodeUniform14;
	float intensity__r_4_;
	float spotty__r_4_;
	vec4 backgroundColor__r_4_;
	float nodeUniform18;
	float detail__r_3_;
	float nodeUniform20;
	vec4 colorA__r_3_;
	float blend__r_3_;
	vec4 colorB__r_3_;
	float nodeUniform24;
	mat4 nodeUniform27;
};


// varyings


// vars
float nodeVar0;
float nodeVar1;
float nodeVar2;
vec2 nodeVar3;
float nodeVar4;
float nodeVar5;
float nodeVar6;
vec4 nodeVar7;
float nodeVar8;
float nodeVar9;
vec2 nodeVar10;
vec2 nodeVar11;
float nodeVar12;
float nodeVar13;
float nodeVar14;
float nodeVar15;
float nodeVar16;
float nodeVar17;
float nodeVar18;
vec2 nodeVar19;
vec2 nodeVar20;
vec2 nodeVar21;
vec2 nodeVar22;
vec2 nodeVar23;
vec2 nodeVar24;
vec2 nodeVar25;
float nodeVar26;
vec2 nodeVar27;
vec2 nodeVar28;
vec2 nodeVar29;
vec2 nodeVar30;
vec2 nodeVar31;
vec2 nodeVar32;
vec2 nodeVar33;
float nodeVar34;
float nodeVar35;
float nodeVar36;
float nodeVar37;
float nodeVar38;
vec2 nodeVar39;
vec2 nodeVar40;
vec2 nodeVar41;
vec2 nodeVar42;
vec2 nodeVar43;
vec2 nodeVar44;
vec2 nodeVar45;
vec2 nodeVar46;
vec2 nodeVar47;
vec2 nodeVar48;
vec2 nodeVar49;
vec2 nodeVar50;
vec2 nodeVar51;
vec2 nodeVar52;
float nodeVar53;
float nodeVar54;
vec2 nodeVar55;
vec2 nodeVar56;
vec2 nodeVar57;
vec2 nodeVar58;
vec2 nodeVar59;
vec2 nodeVar60;
vec2 nodeVar61;
vec2 nodeVar62;
vec2 nodeVar63;
vec2 nodeVar64;
vec2 nodeVar65;
vec2 nodeVar66;
vec2 nodeVar67;
vec2 nodeVar68;
float nodeVar69;
float nodeVar70;
float nodeVar71;
vec2 nodeVar72;
vec2 nodeVar73;
vec2 nodeVar74;
vec2 nodeVar75;
vec2 nodeVar76;
vec2 nodeVar77;
vec2 nodeVar78;
vec2 nodeVar79;
vec2 nodeVar80;
vec2 nodeVar81;
vec2 nodeVar82;
vec2 nodeVar83;
vec2 nodeVar84;
vec2 nodeVar85;
float nodeVar86;
float nodeVar87;
vec4 nodeVar88;
float nodeVar89;
vec2 nodeVar90;
float nodeVar91;
vec2 nodeVar92;
float nodeVar93;
vec2 nodeVar94;
float nodeVar95;
float nodeVar96;
float nodeVar97;
float nodeVar98;
float nodeVar99;
vec3 nodeVar100;
vec4 nodeVar101;
vec4 nodeVar102;
float nodeVar103;
vec4 nodeVar104;
vec4 nodeVar105;

// codes


void main() {

	// flow
	// code

	nodeVar0 = ( thickness__r_5_ * 0.5 );
	nodeVar1 = ( softness__r_5_ * 0.5 );
	nodeVar2 = ( nodeUniform4.zw.x / nodeUniform4.zw.y );
	nodeVar3 = ( vec2( ( ( vec2( gl_FragCoord.xy.x, nodeUniform3.y - gl_FragCoord.xy.y ) / nodeUniform3 ).x * nodeVar2 ), ( vec2( gl_FragCoord.xy.x, nodeUniform3.y - gl_FragCoord.xy.y ) / nodeUniform3 ).y ) - vec2( ( position__r_5_.x * nodeVar2 ), ( 1.0 - position__r_5_.y ) ) );
	nodeVar4 = radians( angle__r_5_ );
	nodeVar5 = sin( nodeVar4 );
	nodeVar6 = cos( nodeVar4 );
	nodeVar7 = vec4( color__r_5_.xyz, ( color__r_5_.w * ( 1.0 - smoothstep( ( nodeVar0 - nodeVar1 ), ( nodeVar0 + nodeVar1 ), abs( ( ( ( nodeVar3.x * nodeVar5 ) + ( nodeVar3.y * nodeVar6 ) ) - ( sin( ( ( ( ( ( nodeVar3.x * nodeVar6 ) - ( nodeVar3.y * nodeVar5 ) ) * frequency__r_5_ ) * ( 3.141592653589793 * 2.0 ) ) + nodeUniform8 ) ) * amplitude__r_5_ ) ) ) ) ) ) );
	nodeVar8 = ( nodeVar7.w * nodeUniform10 );
	nodeVar9 = 0.0;
	nodeVar10 = ( ( vec2( gl_FragCoord.xy.x, nodeUniform3.y - gl_FragCoord.xy.y ) / nodeUniform3 ) - vec2( center__r_4_.x, ( 1.0 - center__r_4_.y ) ) );
	nodeVar11 = vec2( ( nodeVar10.x * ( nodeUniform4.zw.x / nodeUniform4.zw.y ) ), nodeVar10.y );
	nodeVar12 = atan( nodeVar11.y, nodeVar11.x );
	nodeVar13 = mod( nodeVar12, ( 3.141592653589793 * 2.0 ) );
	nodeVar14 = ( 6.0 * density__r_4_ );
	nodeVar15 = ( nodeVar14 * 5.0 );
	nodeVar16 = length( nodeVar11 );
	nodeVar17 = ( nodeUniform14 * 0.2 );
	nodeVar18 = ( ( nodeVar16 * 1.0 ) - ( nodeVar17 * 3.0 ) );
	nodeVar19 = vec2( ( nodeVar13 * nodeVar15 ), nodeVar18 );
	nodeVar20 = floor( nodeVar19 );
	nodeVar21 = ( nodeVar20 + vec2( 1.0, 0.0 ) );
	nodeVar22 = fract( nodeVar19 );
	nodeVar23 = ( ( nodeVar22 * nodeVar22 ) * ( ( nodeVar22 * vec2( -2.0 ) ) + vec2( 3.0 ) ) );
	nodeVar24 = ( nodeVar20 + vec2( 0.0, 1.0 ) );
	nodeVar25 = ( nodeVar20 + vec2( 1.0, 1.0 ) );
	nodeVar26 = ( 4.0 - ( 3.0 * clamp( intensity__r_4_, 0.0, 1.0 ) ) );
	nodeVar27 = vec2( ( nodeVar12 * nodeVar15 ), nodeVar18 );
	nodeVar28 = floor( nodeVar27 );
	nodeVar29 = ( nodeVar28 + vec2( 1.0, 0.0 ) );
	nodeVar30 = fract( nodeVar27 );
	nodeVar31 = ( ( nodeVar30 * nodeVar30 ) * ( ( nodeVar30 * vec2( -2.0 ) ) + vec2( 3.0 ) ) );
	nodeVar32 = ( nodeVar28 + vec2( 0.0, 1.0 ) );
	nodeVar33 = ( nodeVar28 + vec2( 1.0, 1.0 ) );
	nodeVar34 = smoothstep( -0.15, 0.15, nodeVar11.x );
	nodeVar35 = mix( pow( mix( mix( fract( ( sin( ( ( nodeVar20.x * 127.1 ) + ( nodeVar20.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar21.x * 127.1 ) + ( nodeVar21.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar23.x ), mix( fract( ( sin( ( ( nodeVar24.x * 127.1 ) + ( nodeVar24.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar25.x * 127.1 ) + ( nodeVar25.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar23.x ), nodeVar23.y ), nodeVar26 ), pow( mix( mix( fract( ( sin( ( ( nodeVar28.x * 127.1 ) + ( nodeVar28.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar29.x * 127.1 ) + ( nodeVar29.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar31.x ), mix( fract( ( sin( ( ( nodeVar32.x * 127.1 ) + ( nodeVar32.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar33.x * 127.1 ) + ( nodeVar33.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar31.x ), nodeVar31.y ), nodeVar26 ), nodeVar34 );
	nodeVar36 = ( nodeVar15 * 4.0 );
	nodeVar37 = ( 6.5 * abs( spotty__r_4_ ) );
	nodeVar38 = ( ( ( nodeVar16 * 0.5 ) * ( 1.0 + nodeVar37 ) ) - ( nodeVar17 * 2.0 ) );
	nodeVar39 = vec2( ( nodeVar13 * nodeVar36 ), nodeVar38 );
	nodeVar40 = floor( nodeVar39 );
	nodeVar41 = ( nodeVar40 + vec2( 1.0, 0.0 ) );
	nodeVar42 = fract( nodeVar39 );
	nodeVar43 = ( ( nodeVar42 * nodeVar42 ) * ( ( nodeVar42 * vec2( -2.0 ) ) + vec2( 3.0 ) ) );
	nodeVar44 = ( nodeVar40 + vec2( 0.0, 1.0 ) );
	nodeVar45 = ( nodeVar40 + vec2( 1.0, 1.0 ) );
	nodeVar46 = vec2( ( nodeVar12 * nodeVar36 ), nodeVar38 );
	nodeVar47 = floor( nodeVar46 );
	nodeVar48 = ( nodeVar47 + vec2( 1.0, 0.0 ) );
	nodeVar49 = fract( nodeVar46 );
	nodeVar50 = ( ( nodeVar49 * nodeVar49 ) * ( ( nodeVar49 * vec2( -2.0 ) ) + vec2( 3.0 ) ) );
	nodeVar51 = ( nodeVar47 + vec2( 0.0, 1.0 ) );
	nodeVar52 = ( nodeVar47 + vec2( 1.0, 1.0 ) );
	nodeVar35 = ( nodeVar35 * mix( pow( mix( mix( fract( ( sin( ( ( nodeVar40.x * 127.1 ) + ( nodeVar40.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar41.x * 127.1 ) + ( nodeVar41.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar43.x ), mix( fract( ( sin( ( ( nodeVar44.x * 127.1 ) + ( nodeVar44.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar45.x * 127.1 ) + ( nodeVar45.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar43.x ), nodeVar43.y ), nodeVar26 ), pow( mix( mix( fract( ( sin( ( ( nodeVar47.x * 127.1 ) + ( nodeVar47.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar48.x * 127.1 ) + ( nodeVar48.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar50.x ), mix( fract( ( sin( ( ( nodeVar51.x * 127.1 ) + ( nodeVar51.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar52.x * 127.1 ) + ( nodeVar52.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar50.x ), nodeVar50.y ), nodeVar26 ), nodeVar34 ) );
	nodeVar9 = ( nodeVar9 + nodeVar35 );
	nodeVar53 = ( nodeVar14 * 4.5 );
	nodeVar54 = ( ( nodeVar16 * 1.4 ) - ( nodeVar17 * 2.5 ) );
	nodeVar55 = vec2( ( nodeVar13 * nodeVar53 ), nodeVar54 );
	nodeVar56 = floor( nodeVar55 );
	nodeVar57 = ( nodeVar56 + vec2( 1.0, 0.0 ) );
	nodeVar58 = fract( nodeVar55 );
	nodeVar59 = ( ( nodeVar58 * nodeVar58 ) * ( ( nodeVar58 * vec2( -2.0 ) ) + vec2( 3.0 ) ) );
	nodeVar60 = ( nodeVar56 + vec2( 0.0, 1.0 ) );
	nodeVar61 = ( nodeVar56 + vec2( 1.0, 1.0 ) );
	nodeVar62 = vec2( ( nodeVar12 * nodeVar53 ), nodeVar54 );
	nodeVar63 = floor( nodeVar62 );
	nodeVar64 = ( nodeVar63 + vec2( 1.0, 0.0 ) );
	nodeVar65 = fract( nodeVar62 );
	nodeVar66 = ( ( nodeVar65 * nodeVar65 ) * ( ( nodeVar65 * vec2( -2.0 ) ) + vec2( 3.0 ) ) );
	nodeVar67 = ( nodeVar63 + vec2( 0.0, 1.0 ) );
	nodeVar68 = ( nodeVar63 + vec2( 1.0, 1.0 ) );
	nodeVar69 = mix( pow( mix( mix( fract( ( sin( ( ( nodeVar56.x * 127.1 ) + ( nodeVar56.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar57.x * 127.1 ) + ( nodeVar57.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar59.x ), mix( fract( ( sin( ( ( nodeVar60.x * 127.1 ) + ( nodeVar60.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar61.x * 127.1 ) + ( nodeVar61.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar59.x ), nodeVar59.y ), nodeVar26 ), pow( mix( mix( fract( ( sin( ( ( nodeVar63.x * 127.1 ) + ( nodeVar63.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar64.x * 127.1 ) + ( nodeVar64.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar66.x ), mix( fract( ( sin( ( ( nodeVar67.x * 127.1 ) + ( nodeVar67.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar68.x * 127.1 ) + ( nodeVar68.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar66.x ), nodeVar66.y ), nodeVar26 ), nodeVar34 );
	nodeVar70 = ( nodeVar53 * 3.5 );
	nodeVar71 = ( ( ( nodeVar16 * 0.7 ) * ( 1.0 + nodeVar37 ) ) - ( nodeVar17 * 1.8 ) );
	nodeVar72 = vec2( ( nodeVar13 * nodeVar70 ), nodeVar71 );
	nodeVar73 = floor( nodeVar72 );
	nodeVar74 = ( nodeVar73 + vec2( 1.0, 0.0 ) );
	nodeVar75 = fract( nodeVar72 );
	nodeVar76 = ( ( nodeVar75 * nodeVar75 ) * ( ( nodeVar75 * vec2( -2.0 ) ) + vec2( 3.0 ) ) );
	nodeVar77 = ( nodeVar73 + vec2( 0.0, 1.0 ) );
	nodeVar78 = ( nodeVar73 + vec2( 1.0, 1.0 ) );
	nodeVar79 = vec2( ( nodeVar12 * nodeVar70 ), nodeVar71 );
	nodeVar80 = floor( nodeVar79 );
	nodeVar81 = ( nodeVar80 + vec2( 1.0, 0.0 ) );
	nodeVar82 = fract( nodeVar79 );
	nodeVar83 = ( ( nodeVar82 * nodeVar82 ) * ( ( nodeVar82 * vec2( -2.0 ) ) + vec2( 3.0 ) ) );
	nodeVar84 = ( nodeVar80 + vec2( 0.0, 1.0 ) );
	nodeVar85 = ( nodeVar80 + vec2( 1.0, 1.0 ) );
	nodeVar69 = ( nodeVar69 * mix( pow( mix( mix( fract( ( sin( ( ( nodeVar73.x * 127.1 ) + ( nodeVar73.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar74.x * 127.1 ) + ( nodeVar74.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar76.x ), mix( fract( ( sin( ( ( nodeVar77.x * 127.1 ) + ( nodeVar77.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar78.x * 127.1 ) + ( nodeVar78.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar76.x ), nodeVar76.y ), nodeVar26 ), pow( mix( mix( fract( ( sin( ( ( nodeVar80.x * 127.1 ) + ( nodeVar80.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar81.x * 127.1 ) + ( nodeVar81.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar83.x ), mix( fract( ( sin( ( ( nodeVar84.x * 127.1 ) + ( nodeVar84.y * 311.7 ) ) ) * 43758.5453 ) ), fract( ( sin( ( ( nodeVar85.x * 127.1 ) + ( nodeVar85.y * 311.7 ) ) ) * 43758.5453 ) ), nodeVar83.x ), nodeVar83.y ), nodeVar26 ), nodeVar34 ) );
	nodeVar9 = ( nodeVar9 + ( nodeVar69 * 0.7 ) );
	nodeVar86 = ( clamp( nodeVar9, 0.0, 1.0 ) * rayColor__r_4_.w );
	nodeVar87 = ( nodeVar86 + ( backgroundColor__r_4_.w * ( 1.0 - nodeVar86 ) ) );
	nodeVar88 = vec4( ( ( ( rayColor__r_4_.xyz * vec3( nodeVar86 ) ) + ( ( backgroundColor__r_4_.xyz * vec3( backgroundColor__r_4_.w ) ) * vec3( ( 1.0 - nodeVar86 ) ) ) ) / vec3( clamp( nodeVar87, 0.001, 1.0 ) ) ), nodeVar87 );
	nodeVar89 = ( nodeVar88.w * nodeUniform18 );
	nodeVar90 = vec2( ( ( vec2( gl_FragCoord.xy.x, nodeUniform3.y - gl_FragCoord.xy.y ) / nodeUniform3 ).x + ( ( sin( ( ( ( vec2( gl_FragCoord.xy.x, nodeUniform3.y - gl_FragCoord.xy.y ) / nodeUniform3 ).y * ( detail__r_3_ * 1.7 ) ) + ( nodeUniform20 * 0.8 ) ) ) * 0.12 ) + ( cos( ( ( ( vec2( gl_FragCoord.xy.x, nodeUniform3.y - gl_FragCoord.xy.y ) / nodeUniform3 ).x * ( detail__r_3_ * 0.9 ) ) - ( nodeUniform20 * 0.5 ) ) ) * 0.05 ) ) ), ( ( vec2( gl_FragCoord.xy.x, nodeUniform3.y - gl_FragCoord.xy.y ) / nodeUniform3 ).y + ( ( cos( ( ( ( vec2( gl_FragCoord.xy.x, nodeUniform3.y - gl_FragCoord.xy.y ) / nodeUniform3 ).x * ( detail__r_3_ * 1.3 ) ) - ( nodeUniform20 * 0.6 ) ) ) * 0.12 ) + ( sin( ( ( ( vec2( gl_FragCoord.xy.x, nodeUniform3.y - gl_FragCoord.xy.y ) / nodeUniform3 ).y * ( detail__r_3_ * 1.1 ) ) + ( nodeUniform20 * 0.7 ) ) ) * 0.05 ) ) ) );
	nodeVar91 = ( detail__r_3_ * 2.1 );
	nodeVar92 = vec2( ( nodeVar90.x + ( ( cos( ( ( nodeVar90.y * ( nodeVar91 * 2.7 ) ) - ( nodeUniform20 * 0.45 ) ) ) * 0.07 ) + ( sin( ( ( nodeVar90.x * ( nodeVar91 * 1.9 ) ) + ( nodeUniform20 * 0.6 ) ) ) * 0.04 ) ) ), ( nodeVar90.y + ( ( sin( ( ( nodeVar90.x * ( nodeVar91 * 2.3 ) ) + ( nodeUniform20 * 0.65 ) ) ) * 0.07 ) + ( cos( ( ( nodeVar90.y * ( nodeVar91 * 1.6 ) ) - ( nodeUniform20 * 0.4 ) ) ) * 0.04 ) ) ) );
	nodeVar93 = ( detail__r_3_ * 3.7 );
	nodeVar94 = vec2( ( nodeVar92.x + ( ( ( sin( ( ( nodeVar92.y * ( nodeVar93 * 1.8 ) ) + ( nodeUniform20 * 0.85 ) ) ) * 0.04 ) + ( cos( ( ( nodeVar92.x * ( nodeVar93 * 1.3 ) ) - ( nodeUniform20 * 0.55 ) ) ) * 0.025 ) ) + ( sin( ( ( ( nodeVar92.x + nodeVar92.y ) * ( nodeVar93 * 0.7 ) ) + ( nodeUniform20 * 0.9 ) ) ) * 0.02 ) ) ), ( nodeVar92.y + ( ( ( cos( ( ( nodeVar92.x * ( nodeVar93 * 1.6 ) ) - ( nodeUniform20 * 0.75 ) ) ) * 0.04 ) + ( sin( ( ( nodeVar92.y * ( nodeVar93 * 1.1 ) ) + ( nodeUniform20 * 0.5 ) ) ) * 0.025 ) ) + ( cos( ( ( ( nodeVar92.x + nodeVar92.y ) * ( nodeVar93 * 0.8 ) ) - ( nodeUniform20 * 0.95 ) ) ) * 0.02 ) ) ) );
	nodeVar95 = ( ( ( sin( ( ( ( nodeVar90.x * ( detail__r_3_ * 2.1 ) ) + ( nodeVar90.y * ( detail__r_3_ * 1.8 ) ) ) + ( nodeUniform20 * 0.4 ) ) ) * 0.45 ) + ( cos( ( ( ( nodeVar92.x * ( nodeVar91 * 1.4 ) ) - ( nodeVar92.y * ( nodeVar91 * 1.9 ) ) ) + ( nodeUniform20 * 0.35 ) ) ) * 0.35 ) ) + ( sin( ( ( ( nodeVar94.x * ( nodeVar93 * 1.1 ) ) + ( nodeVar94.y * ( nodeVar93 * 1.5 ) ) ) - ( nodeUniform20 * 0.55 ) ) ) * 0.2 ) );
	nodeVar96 = smoothstep( 0.3, 0.7, ( ( ( nodeVar95 * 0.5 ) + 0.5 ) + ( ( blend__r_3_ - 50.0 ) * 0.006 ) ) );
	nodeVar97 = ( colorA__r_3_.w * ( 1.0 - nodeVar96 ) );
	nodeVar98 = ( colorB__r_3_.w * nodeVar96 );
	nodeVar99 = ( nodeVar97 + nodeVar98 );
	nodeVar100 = ( ( ( vec3( colorA__r_3_.x, colorA__r_3_.y, colorA__r_3_.z ) * vec3( nodeVar97 ) ) + ( vec3( colorB__r_3_.x, colorB__r_3_.y, colorB__r_3_.z ) * vec3( nodeVar98 ) ) ) / vec3( max( nodeVar99, 0.001 ) ) );
	nodeVar101 = ( vec4( nodeVar100.x, nodeVar100.y, nodeVar100.z, nodeVar99 ) * vec4( ( ( sin( ( ( nodeUniform20 * 2.5 ) + ( nodeVar95 * 8.0 ) ) ) * 0.015 ) + 1.0 ) ) );
	nodeVar102 = vec4( nodeVar101.xyz, nodeVar101.w );
	nodeVar103 = ( nodeVar102.w * nodeUniform24 );
	nodeVar104 = vec4( ( ( nodeVar102.xyz * vec3( nodeVar103 ) ) + ( vec4( 1.0, 1.0, 1.0, 0.0 ).xyz * vec3( ( vec4( 1.0, 1.0, 1.0, 0.0 ).w * ( 1.0 - nodeVar103 ) ) ) ) ), ( nodeVar103 + ( vec4( 1.0, 1.0, 1.0, 0.0 ).w * ( 1.0 - nodeVar103 ) ) ) );
	nodeVar105 = vec4( ( ( nodeVar88.xyz * vec3( nodeVar89 ) ) + ( nodeVar104.xyz * vec3( ( nodeVar104.w * ( 1.0 - nodeVar89 ) ) ) ) ), ( nodeVar89 + ( nodeVar104.w * ( 1.0 - nodeVar89 ) ) ) );

	// result
	fragColor = vec4( ( ( nodeVar7.xyz * vec3( nodeVar8 ) ) + ( nodeVar105.xyz * vec3( ( nodeVar105.w * ( 1.0 - nodeVar8 ) ) ) ) ), ( nodeVar8 + ( nodeVar105.w * ( 1.0 - nodeVar8 ) ) ) );

}
