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
	mat3 nodeUniform1;
	vec2 nodeUniform3;
	vec4 nodeUniform4;
	float nodeUniform5;
	uint nodeUniform6;
	float gamma__r_2_;
	float nodeUniform8;
	float nodeUniform9;
	float nodeUniform10;
	float spacing__r_2_;
	uint nodeUniform12;
	float alphaThreshold__r_2_;
	float preserveAlpha__r_2_;
	float nodeUniform15;
	mat4 nodeUniform18;
};
uniform sampler2D nodeUniform0;
uniform sampler2D nodeUniform2;

// varyings


// vars
vec3 nodeVar0;
vec2 nodeVar1;
vec2 nodeVar2;
vec2 nodeVar3;
vec2 nodeVar4;
bool nodeVar5;
vec2 nodeVar6;
vec4 nodeVar7;
vec4 nodeVar8;
float nodeVar9;
float nodeVar10;
vec2 nodeVar11;
vec2 nodeVar12;
vec2 nodeVar13;
bool nodeVar14;
vec2 nodeVar15;
vec4 nodeVar16;
float nodeVar17;
float nodeVar18;
vec4 nodeVar19;
float nodeVar20;

// codes


void main() {

	// flow
	// code

	nodeVar1 = ( nodeUniform4.zw / vec2( ( nodeUniform5 * ( nodeUniform4.zw.y / 1080.0 ) ) ) );
	nodeVar2 = ( ( vec2( gl_FragCoord.xy.x, nodeUniform3.y - gl_FragCoord.xy.y ) / nodeUniform3 ) * nodeVar1 );
	nodeVar3 = ( ( floor( nodeVar2 ) + vec2( 0.5, 0.5 ) ) / nodeVar1 );
	nodeVar5 = bool( nodeUniform6 );

	if ( nodeVar5 ) {

		nodeVar6 = nodeVar3;
		nodeVar4 = vec2( nodeVar6.x, 1.0 - nodeVar6.y );

	} else {

		nodeVar4 = nodeVar3;

	}

	nodeVar7 = texture( nodeUniform2, nodeVar4 );

	if ( ( nodeVar7.w > 0.001 ) ) {

		nodeVar0 = ( nodeVar7.xyz / vec3( nodeVar7.w ) );

	} else {

		nodeVar0 = vec3( 0.0, 0.0, 0.0 );

	}

	nodeVar8 = vec4( nodeVar0, nodeVar7.w );
	nodeVar9 = clamp( floor( ( ( 1.0 - pow( dot( nodeVar8.xyz, vec3( 0.299, 0.587, 0.114 ) ), gamma__r_2_ ) ) * nodeUniform8 ) ), 0.0, ( nodeUniform8 - 1.0 ) );
	nodeVar10 = ( ( 1.0 / nodeUniform9 ) * nodeUniform10 );
	nodeVar11 = ( fract( nodeVar2 ) - vec2( 0.5, 0.5 ) );
	nodeVar12 = ( nodeUniform1 * vec3( ( ( vec2( mod( nodeVar9, nodeUniform9 ), floor( ( nodeVar9 / nodeUniform9 ) ) ) * vec2( nodeVar10 ) ) + ( ( ( nodeVar11 / vec2( spacing__r_2_ ) ) + vec2( 0.5, 0.5 ) ) * vec2( nodeVar10 ) ) ), 1.0 ) ).xy;
	nodeVar14 = bool( nodeUniform12 );

	if ( nodeVar14 ) {

		nodeVar15 = nodeVar12;
		nodeVar13 = vec2( nodeVar15.x, 1.0 - nodeVar15.y );

	} else {

		nodeVar13 = nodeVar12;

	}

	nodeVar16 = texture( nodeUniform0, nodeVar13 );

	if ( ( ( ( dot( nodeVar16.xyz, vec3( 0.299, 0.587, 0.114 ) ) < 0.1 ) || any( greaterThan( abs( nodeVar11 ), vec2( ( spacing__r_2_ * 0.5 ) ) ) ) ) || ( nodeVar8.w < alphaThreshold__r_2_ ) ) ) {

		nodeVar17 = 0.0;

	} else {


		if ( ( preserveAlpha__r_2_ > 0.5 ) ) {

			nodeVar18 = nodeVar8.w;

		} else {

			nodeVar18 = 1.0;

		}

		nodeVar17 = nodeVar18;

	}

	nodeVar19 = vec4( ( nodeVar16.xyz * nodeVar8.xyz ), nodeVar17 );
	nodeVar20 = ( nodeVar19.w * nodeUniform15 );

	// result
	fragColor = vec4( ( ( nodeVar19.xyz * vec3( nodeVar20 ) ) + ( vec4( 1.0, 1.0, 1.0, 0.0 ).xyz * vec3( ( vec4( 1.0, 1.0, 1.0, 0.0 ).w * ( 1.0 - nodeVar20 ) ) ) ) ), ( nodeVar20 + ( vec4( 1.0, 1.0, 1.0, 0.0 ).w * ( 1.0 - nodeVar20 ) ) ) );

}
