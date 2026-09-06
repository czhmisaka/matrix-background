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
	vec2 nodeUniform1;
	mat3 nodeUniform3;
	vec4 nodeUniform4;
	float gridSize__r_1_;
	uint nodeUniform6;
	uint nodeUniform7;
	mat4 nodeUniform10;
};
uniform sampler2D nodeUniform0;
uniform sampler2D nodeUniform2;

// varyings


// vars
vec3 nodeVar0;
float nodeVar1;
float nodeVar2;
bool nodeVar3;
float nodeVar4;
float nodeVar5;
float nodeVar6;
vec2 nodeVar7;
vec2 nodeVar8;
bool nodeVar9;
vec2 nodeVar10;
vec4 nodeVar11;
vec2 nodeVar12;
vec2 nodeVar13;
bool nodeVar14;
vec2 nodeVar15;
vec4 nodeVar16;

// codes


void main() {

	// flow
	// code

	nodeVar2 = ( nodeUniform4.zw.x / nodeUniform4.zw.y );
	nodeVar3 = ( nodeVar2 > 1.0 );

	if ( nodeVar3 ) {

		nodeVar1 = gridSize__r_1_;

	} else {

		nodeVar1 = ( gridSize__r_1_ * nodeVar2 );

	}

	nodeVar4 = max( nodeVar1, 1.0 );

	if ( nodeVar3 ) {

		nodeVar5 = ( gridSize__r_1_ / nodeVar2 );

	} else {

		nodeVar5 = gridSize__r_1_;

	}

	nodeVar6 = max( nodeVar5, 1.0 );
	nodeVar7 = ( nodeUniform3 * vec3( vec2( ( ( floor( ( ( vec2( gl_FragCoord.xy.x, nodeUniform1.y - gl_FragCoord.xy.y ) / nodeUniform1 ).x * nodeVar4 ) ) + 0.5 ) / nodeVar4 ), ( ( floor( ( ( vec2( gl_FragCoord.xy.x, nodeUniform1.y - gl_FragCoord.xy.y ) / nodeUniform1 ).y * nodeVar6 ) ) + 0.5 ) / nodeVar6 ) ), 1.0 ) ).xy;
	nodeVar9 = bool( nodeUniform6 );

	if ( nodeVar9 ) {

		nodeVar10 = nodeVar7;
		nodeVar8 = vec2( nodeVar10.x, 1.0 - nodeVar10.y );

	} else {

		nodeVar8 = nodeVar7;

	}

	nodeVar11 = texture( nodeUniform2, nodeVar8 );
	nodeVar12 = ( ( vec2( gl_FragCoord.xy.x, nodeUniform1.y - gl_FragCoord.xy.y ) / nodeUniform1 ) - clamp( nodeVar11.xy, vec2( ( - 0.1 ), ( - 0.1 ) ), vec2( 0.1, 0.1 ) ) );
	nodeVar14 = bool( nodeUniform7 );

	if ( nodeVar14 ) {

		nodeVar15 = nodeVar12;
		nodeVar13 = vec2( nodeVar15.x, 1.0 - nodeVar15.y );

	} else {

		nodeVar13 = nodeVar12;

	}

	nodeVar16 = texture( nodeUniform0, nodeVar13 );

	if ( ( nodeVar16.w > 0.001 ) ) {

		nodeVar0 = ( nodeVar16.xyz / vec3( nodeVar16.w ) );

	} else {

		nodeVar0 = vec3( 0.0, 0.0, 0.0 );

	}


	// result
	fragColor = vec4( nodeVar0, nodeVar16.w );

}
