
; ===========================================================================
;
;	Vector ROM	136021.105	$3000-$3FFF
;
;	ROM0	1F		136021.214	$6000-$7FFF
;	ROM1	1H/J	136021.102	$8000-$9FFF
;	ROM2	1J/K	136021.203	$A000-$BFFF
;	ROM3	1K/L	136021.104	$C000-$DFFF
;	ROM4	1M		136021.206	$E000-$FFFF
;



	include	"Direct_Page.asm"

	include	"Memory_Locations.asm"


; ===========================================================================

		org $6000
MATHROM:	fdb $7EF2
		fdb $61EF
		fcb $56	; V

; =============== S U B	R O U T	I N E =======================================


sub_6005:
		ldx	#0
		ldd	#$F800
		lda	#$48 ; 'H'
		tfr	a, dp
		lsr	<DPbyte_3D
		bcc	sub_6005
		cmps	#$4FFF
		beq	loc_601A
		rts
; ---------------------------------------------------------------------------

loc_601A:
		lda	<DPbyte_28
		bne	loc_602F
		lda	>word_4824	; Opt0_Shadow
		anda	#$80 ; 'Ä'
		bne	loc_602F	; Check	DIP switch for freeze mode
		lda	<DPbyte_31
		bita	#$80 ; 'Ä'
		beq	sub_6005
		anda	#$7F ; ''
		sta	<DPbyte_31

loc_602F:
		jsr	sub_60BE

loc_6032:				; Vector pointer state
		lda	<DPbyte_3F
		bmi	loc_6032

loc_6036:				; Game mode/screen state
		lda	<DPbyte_41
		cmpa	#$3D ; '='      ; Check game state for out of bounds

loc_603A:
		bcc	loc_603A
		asla
		ldx	#Jump_Table_1
		jsr	[a,x]
		bra	sub_6005
; End of function sub_6005

; ---------------------------------------------------------------------------
Jump_Table_1:	fdb sub_6275		; 0 ; Game initialisation
		fdb sub_64E2		; 1
		fdb sub_64F1		; 2
		fdb sub_6513		; 3
		fdb sub_6532		; 4
		fdb sub_6708		; 5
		fdb sub_676B		; 6
		fdb sub_62E4		; 7
		fdb sub_6306		; 8
		fdb sub_6326		; 9
		fdb sub_6348		; 10
		fdb sub_6459		; 11
		fdb sub_6483		; 12
		fdb sub_656C		; 13
		fdb sub_659F		; 14
		fdb sub_6670		; 15
		fdb sub_66AC		; 16
		fdb sub_6D3B		; 17
		fdb sub_6D54		; 18
		fdb sub_6D80		; 19
		fdb sub_6D86		; 20
		fdb sub_6D95		; 21
		fdb sub_6D98		; 22
		fdb sub_6708		; 23
		fdb sub_676B		; 24
		fdb sub_6787		; 25
		fdb sub_679A		; 26
		fdb sub_67E5		; 27
		fdb loc_67FD		; 28
		fdb sub_6802		; 29
		fdb loc_682F		; 30
		fdb sub_6838		; 31
		fdb loc_6859		; 32
		fdb sub_68D0		; 33
		fdb loc_68D5		; 34
		fdb sub_6912		; 35
		fdb sub_6933		; 36
		fdb sub_6953		; 37
		fdb sub_6968		; 38
		fdb sub_6A50		; 39
		fdb sub_6A7E		; 40
		fdb sub_69A9		; 41
		fdb sub_69F4		; 42
		fdb sub_6A50		; 43
		fdb sub_6A89		; 44
		fdb sub_6AAB		; 45
		fdb loc_6ABF		; 46
		fdb sub_6B22		; 47
		fdb loc_6B32		; 48
		fdb sub_6AFF		; 49
		fdb loc_6B1D		; 50
		fdb sub_6BDB		; 51
		fdb sub_6BF1		; 52
		fdb loc_6C76		; 53
		fdb sub_6C84		; 54
		fdb loc_6CB6		; 55
		fdb sub_6CC4		; 56
		fdb loc_6CE1		; 57
		fdb sub_6CEF		; 58
		fdb sub_6D0C		; 59
		fdb sub_6D15		; 60

; =============== S U B	R O U T	I N E =======================================


sub_60BE:
		inc	<DPbyte_43	; Game over/insert coins timer
		bne	loc_60CA
		inc	<DPbyte_42
		bne	loc_60CA
		lda	#$80 ; 'Ä'
		sta	<DPbyte_42

loc_60CA:				; Credits
		lda	>byte_4814
		bne	loc_60D4
		sta	byte_4B31
		bra	loc_60F4
; ---------------------------------------------------------------------------

loc_60D4:
		lda	byte_4B31
		bne	loc_60E4
		jsr	Sound_6
		lda	>byte_4814	; Credits
		sta	byte_4B31
		bra	loc_60F4
; ---------------------------------------------------------------------------

loc_60E4:
		lda	byte_4B31
		cmpa	>byte_4814	; Credits
		bcc	loc_60F4
		jsr	Sound_3
; ---------------------------------------------------------------------------
		lda	#$FF
		sta	byte_4B31

loc_60F4:
		jsr	sub_70DB
		lda	<DPbyte_AB
		sta	<DPbyte_AA
		lda	<DPbyte_21
		anda	#$30 ; '0'
		pshs	a
		lda	<DPbyte_1E
		anda	#$CF ; 'œ'
		ora	,s+
		anda	#$F4 ; 'Ù'
		sta	<DPbyte_AB
		eora	<DPbyte_AA
		anda	<DPbyte_AA
		sta	<DPbyte_AC
		rts
; End of function sub_60BE


; =============== S U B	R O U T	I N E =======================================

; Insert vector	data for four blue dots	in screen corners

sub_6112:
		lda	<DPbyte_3F	; Vector pointer state
		ldb	#$70 ; 'p'
		tfr	d, y		; Set new vector pointer value
		ldd	#$B99E		; Vector JRSL to draw four blue	dots in	screen corners
		std	,y++
		rts
; End of function sub_6112


; =============== S U B	R O U T	I N E =======================================

; Copies Star Wars logo	vector data to vector RAM

sub_611E:
		ldx	#word_CEDE	; Copies vector	data. Called at	start of attract screen	2
		ldu	#$2800

loc_6124:
		ldd	,x++
		std	,u++
		cmpu	#$3000
		bcs	loc_6124
		rts
; End of function sub_611E


; =============== S U B	R O U T	I N E =======================================

; Vector instructions end

sub_612F:
		ldd	#$8040
		std	,y++
		ldd	#$2020		; Vector HALT
		std	,y++
		std	,y+
		tfr	y, d
		suba	<DPbyte_3F	; Vector pointer state
		suba	#$14
		bcs	loc_6155
		jsr	sub_611E	; Copies Star Wars logo	vector data to vector RAM
		ldd	#$2020
		std	$13FE
		std	$13FC
		std	$27FE
		std	$27FC

loc_6155:
		lda	#$FF
		sta	<DPbyte_3F	; Vector pointer state
		rts
; End of function sub_612F


; =============== S U B	R O U T	I N E =======================================

; More stars/ties init stuff

sub_615A:
		jsr	sub_6161	; Initialise tie fighters and fireballs
		jsr	sub_7A48
		rts
; End of function sub_615A


; =============== S U B	R O U T	I N E =======================================

; Initialise tie fighters and fireballs

sub_6161:
		lda	PRNG
		suba	PRNG
		bne	loc_6171
		sta	PRNGClr
		lda	#$80 ; 'Ä'
		sta	PRNGClr

loc_6171:
		lda	#$80 ; 'Ä'
		sta	<DPbyte_83	; Star intensity
		ldx	#byte_4900	; 3x Tie fighter data structure	($19 bytes per Tie)
		ldu	#word_50F0	; 3x Tie fighter math data structure ($20 bytes	per Tie)
		ldb	#$1C

loc_617D:
		stu	,x
		stb	2,x
		leau	$20,u
		addb	#4
		leax	$19,x
		cmpx	#byte_4900+$4B	; 3x Tie fighter data structure	($19 bytes per Tie)
		bcs	loc_617D
		ldx	#byte_494B	; 6x Fireball data structure 2 ($6 bytes per fireball)
		ldu	#word_5160	; 6x Fireball math data	structure 2 ($8	bytes per Tie)
		ldb	#$2C ; ','

loc_6196:
		stu	,x
		stb	2,x
		clr	3,x
		leau	8,u
		addb	#1
		leax	6,x
		cmpx	#byte_494B+$24	; 6x Fireball data structure 2 ($6 bytes per fireball)
		bcs	loc_6196
		jsr	sub_8ED6
		ldb	#4
		jsr	sub_CCCC	; Copy XYZ data	to math	RAM
		ldb	#7
		jsr	sub_CCCC	; Copy XYZ data	to math	RAM
		rts
; End of function sub_6161


; =============== S U B	R O U T	I N E =======================================

; Set up math constants

sub_61B5:
		ldd	#0
		std	MReg0F		; Math zero constant
		ldd	#$4000
		std	MReg10		; Math 1.000 constant
		ldd	#$E000
		std	MReg13		; Constant -0.5	?
		ldd	#$80 ; 'Ä'
		std	MReg35		; Math Constant	$0080
		ldd	#$40 ; '@'
		std	MReg34		; Math Constant	$0040
		ldd	#$21F
		std	MReg11		; Sine for rotation
		ldd	#$3FF7
		std	MReg12		; Cosine for rotation
		ldd	#$4000
		std	MReg36		; Math 1.000 constant
		ldd	#$200
		std	DVDDH
		rts
; End of function sub_61B5


; =============== S U B	R O U T	I N E =======================================

; Init stars math data

sub_61EC:
		lda	#$80 ; 'Ä'      ; Init star intesity
		sta	<DPbyte_83	; Star intensity
		ldx	#Star_Dots_MRAM

loc_61F3:
		lda	PRNG
		ldb	PRNG
		std	,x
		mul
		lda	PRNG
		std	2,x
		mul
		lda	PRNG
		std	4,x
		leax	8,x
		cmpx	#Star_Dots_MRAM+$190
		bcs	loc_61F3
		rts
; End of function sub_61EC


; =============== S U B	R O U T	I N E =======================================

; Init towers surface dots

sub_620F:
		ldx	#Star_Dots_MRAM

loc_6212:
		lda	PRNG
		ldb	PRNG
		std	,x
		mul
		lda	PRNG
		std	2,x
		ldd	#0
		std	4,x
		leax	8,x
		cmpx	#Star_Dots_MRAM+$190
		bcs	loc_6212
		rts
; End of function sub_620F


; =============== S U B	R O U T	I N E =======================================

; Check	joystick X to show high	scores if moved

sub_622D:
		ldb	<DPbyte_7D	; Joystick X
		cmpb	#$A0 ; '†'
		bgt	loc_623E
		lda	#8
		cmpa	<DPbyte_41	; Game mode/screen state
		beq	loc_623C
		deca
		sta	<DPbyte_41	; Game mode/screen state

loc_623C:
		bra	loc_624B
; ---------------------------------------------------------------------------

loc_623E:
		cmpb	#$60 ; '`'
		blt	loc_624B
		lda	#$C
		cmpa	<DPbyte_41	; Game mode/screen state
		beq	loc_624B
		deca
		sta	<DPbyte_41	; Game mode/screen state

loc_624B:
		lda	byte_4591
		anda	#3
		bne	loc_6257
		lda	#1
		sta	>byte_4814	; Credits

loc_6257:				; Credits
		lda	>byte_4814
		beq	loc_6269
		lda	<DPbyte_AC
		anda	#$F0 ; ''
		beq	loc_6269
		lda	#$19
		sta	<DPbyte_41	; Game mode/screen state
		dec	>byte_4814	; Credits

loc_6269:
		lda	>word_481E
		anda	#$10
		bne	locret_6274
		lda	#1
		sta	<DPbyte_41	; Game mode/screen state

locret_6274:
		rts
; End of function sub_622D


; =============== S U B	R O U T	I N E =======================================

; Game initialisation

sub_6275:
		orcc	#$10		; Disable interrupts
		ldx	#$4534
		jsr	sub_C6D4	; Read NOVRAM
		ldx	#byte_4AFA
		jsr	sub_62D5
		sta	>byte_4866
		ldx	#byte_4AFB
		jsr	sub_62D5
		sta	>byte_4868
		ldx	#byte_4AFC
		jsr	sub_62D5
		sta	>byte_486F
		ldx	#byte_4AFD
		jsr	sub_62D5
		sta	>byte_4871
		andcc	#$EF ; 'Ô'      ; Enable interrupts
		lda	#$B
		sta	<DPbyte_41	; Game mode/screen state
		lda	#$FF
		sta	byte_4B34
		jsr	sub_61B5	; Set up math constants
		jsr	sub_615A	; More stars/ties init stuff
		jsr	sub_611E	; Copies Star Wars logo	vector data to vector RAM
		jsr	sub_61EC	; Init stars math data
		jsr	sub_D91A
		lda	#0
		sta	<DPbyte_5C	; Score	millions
		sta	<DPbyte_5D	; Score	hundred	thousands
		sta	<DPbyte_5E	; Score	thousands
		sta	<DPbyte_5F	; Score
		sta	<DPbyte_8B
		sta	<DPbyte_8C	; Sheild being depleted
		jsr	sub_CC18
		lda	#$FF
		sta	word_4AEC
		sta	>byte_4818
		rts
; End of function sub_6275


; =============== S U B	R O U T	I N E =======================================


sub_62D5:
		lda	#$40 ; '@'
		cmpa	,x
		bls	locret_62E3
		suba	,x
		lsra
		lsra
		lsra
		inca
		adda	,x

locret_62E3:
		rts
; End of function sub_62D5


; =============== S U B	R O U T	I N E =======================================

; Called once before attract screen 3

sub_62E4:
		ldd	#0
		std	word_4B0C	; Attract text position	for scrolling
		ldd	#$200
		std	word_4B0E	; Attract screen/game phase  timer
		lda	#$F
		sta	word_4ADB
		lda	#$1F
		sta	word_4ADB+1
		ldd	#$6480
		std	byte_4B10	; Attract text colour/intensity	for fading
		jsr	sub_D91A
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_62E4


; =============== S U B	R O U T	I N E =======================================

; Attract screen 3

sub_6306:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		jsr	sub_761D	; Display score
		jsr	sub_63D5	; Check	credits	status
		jsr	sub_6368
		jsr	sub_CD80	; Starfield
		jsr	sub_612F	; Vector instructions end
		jsr	sub_6DB6	; Attract screen 3 stars YT move
		ldd	word_4B0E	; Attract screen/game phase  timer
		bpl	loc_6322
		inc	<DPbyte_41	; Game mode/screen state

loc_6322:				; Check	joystick X to show high	scores if moved
		jsr	sub_622D
		rts
; End of function sub_6306


; =============== S U B	R O U T	I N E =======================================


sub_6326:
		ldd	#$3C0		; Called once before attract screen 4
		std	word_4B0C	; Attract text position	for scrolling
		ldd	#$200
		std	word_4B0E	; Attract screen/game phase  timer
		lda	#$23 ; '#'
		sta	word_4ADB
		lda	#$2C ; ','
		sta	word_4ADB+1
		ldd	#$6580
		std	byte_4B10	; Attract text colour/intensity	for fading
		jsr	sub_D91A
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_6326


; =============== S U B	R O U T	I N E =======================================

; Attract screen 4

sub_6348:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		jsr	sub_761D	; Display score
		jsr	sub_63D5	; Check	credits	status
		jsr	sub_6368
		jsr	sub_CD80	; Starfield
		jsr	sub_612F	; Vector instructions end
		jsr	sub_6DC0	; Attract screen 4 stars ZT move
		ldd	word_4B0E	; Attract screen/game phase  timer
		bpl	loc_6364
		inc	<DPbyte_41	; Game mode/screen state

loc_6364:				; Check	joystick X to show high	scores if moved
		jsr	sub_622D
		rts
; End of function sub_6348


; =============== S U B	R O U T	I N E =======================================


sub_6368:
		ldd	word_4B0E	; Attract screen/game phase  timer
		subd	#1
		std	word_4B0E	; Attract screen/game phase  timer
		andb	#7
		bne	loc_639D
		lda	word_4ADB
		bmi	loc_637D
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text

loc_637D:
		lda	word_4ADB
		cmpa	#$12
		bne	loc_638E
		lda	byte_4593
		anda	#3
		adda	#$1F
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text

loc_638E:
		lda	word_4ADB
		adda	#1
		cmpa	word_4ADB+1
		bcs	loc_639A
		lda	#$80 ; 'Ä'

loc_639A:
		sta	word_4ADB

loc_639D:				; Attract text position	for scrolling
		ldd	word_4B0C
		subd	#8
		bpl	loc_63A8
		ldd	#0

loc_63A8:				; Attract text position	for scrolling
		std	word_4B0C
		ldd	word_4B0E	; Attract screen/game phase  timer
		cmpd	#$C0 ; '¿'
		bcc	loc_63C6
		ldb	byte_4B11	; Attract text intensity
		subb	#1
		cmpb	#$10
		bcc	loc_63C3
		ldd	#0
		std	word_4B0E	; Attract screen/game phase  timer

loc_63C3:				; Attract text intensity
		stb	byte_4B11

loc_63C6:				; Attract text position	for scrolling
		ldd	word_4B0C
		std	>byte_48AF
		ldd	byte_4B10	; Attract text colour/intensity	for fading
		std	,y++
		jsr	sub_D942	; Called from Attract screen 3 + 4
		rts
; End of function sub_6368


; =============== S U B	R O U T	I N E =======================================

; Check	credits	status

sub_63D5:
		lda	>byte_4814	; Credits
		bne	loc_63EB
		lda	<DPbyte_43	; Game over/insert coins timer
		anda	#$10
		bne	loc_63E4
		ldb	#6
		bra	loc_63E6
; ---------------------------------------------------------------------------

loc_63E4:
		ldb	#5

loc_63E6:				; Print	text string from pointer table
		jsr	sub_E7C7
		bra	loc_63F0
; ---------------------------------------------------------------------------

loc_63EB:
		ldb	#$B
		jsr	sub_E7C7	; Print	text string from pointer table

loc_63F0:				; Credits
		lda	>byte_4814
		bne	loc_6410
		lda	>byte_4812	; Half credit
		beq	loc_6404
		lda	<DPbyte_43	; Game over/insert coins timer
		anda	#$10
		beq	loc_6404
		bra	loc_6410
; ---------------------------------------------------------------------------
		bra	loc_640E
; ---------------------------------------------------------------------------

loc_6404:
		ldb	byte_4591
		andb	#3
		addb	#7
		jsr	sub_E7C7	; Print	text string from pointer table

loc_640E:
		bra	locret_6458
; ---------------------------------------------------------------------------

loc_6410:				; Credits
		lda	>byte_4814
		adda	>byte_4812	; Half credit
		cmpa	#1
		bne	loc_641E
		ldb	#$D
		bra	loc_6420
; ---------------------------------------------------------------------------

loc_641E:
		ldb	#$C

loc_6420:				; Print	text string from pointer table
		jsr	sub_E7C7
		ldd	#$1B0
		anda	#$1F
		std	,y++
		ldd	#$FF80
		tst	>byte_4812	; Half credit
		beq	loc_6435
		subd	#$18

loc_6435:
		anda	#$1F
		std	,y++
		lda	>byte_4814	; Credits
		cmpa	#$A
		bcs	loc_6442
		adda	#6

loc_6442:
		ldb	#2
		stb	<DPbyte_AD
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	>byte_4812	; Half credit
		beq	loc_6453
		ldd	#$B8F3
		std	,y++

loc_6453:
		ldd	#$8040
		std	,y++

locret_6458:
		rts
; End of function sub_63D5


; =============== S U B	R O U T	I N E =======================================


sub_6459:
		ldd	#0		; Called once before attract screen 1
		std	word_4B0C	; Attract text position	for scrolling
		std	>byte_48AF
		ldd	#$100
		std	word_4B0E	; Attract screen/game phase  timer
		ldd	#$6180
		std	byte_4B10	; Attract text colour/intensity	for fading
		jsr	sub_D91A
		jsr	sub_61B5	; Set up math constants
		jsr	sub_615A	; More stars/ties init stuff
		ldu	#MReg1C		; Matrix 2
		jsr	sub_CDC3	; Initialise math registers matrix
		jsr	loc_CC38
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_6459


; =============== S U B	R O U T	I N E =======================================

; Attract screen 1

sub_6483:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		jsr	sub_64CD	; Print	Star Wars and copyright	text
		jsr	sub_CD80	; Starfield
		jsr	sub_761D	; Display score

loc_648F:				; Check	credits	status
		jsr	sub_63D5
		ldd	word_4B0E	; Attract screen/game phase  timer
		cmpd	#$50 ; 'P'
		bcc	loc_64A9
		ldb	byte_4B11	; Attract text intensity
		subb	#1
		cmpb	#$F0 ; ''
		bcs	loc_64A6
		ldb	#0

loc_64A6:				; Attract text intensity
		stb	byte_4B11

loc_64A9:				; Attract text colour/intensity	for fading
		ldd	byte_4B10
		std	,y++
		jsr	sub_C7FD	; Display high scores
		jsr	sub_D923	; Called from attract screen 1
		jsr	sub_612F	; Vector instructions end
		jsr	sub_6DCA	; Move stars XT	translate position
		ldd	word_4B0E	; Attract screen/game phase  timer
		subd	#1
		std	word_4B0E	; Attract screen/game phase  timer
		bpl	loc_64C9
		lda	#5
		sta	<DPbyte_41	; Game mode/screen state

loc_64C9:				; Check	joystick X to show high	scores if moved
		jsr	sub_622D
		rts
; End of function sub_6483


; =============== S U B	R O U T	I N E =======================================

; Print	Star Wars and copyright	text

sub_64CD:
		ldb	#0
		jsr	sub_E7C7	; Print	text string from pointer table
		ldb	#1
		jsr	sub_E7C7	; Print	text string from pointer table
		ldb	#2
		jsr	sub_E7C7	; Print	text string from pointer table
		ldb	#3
		jsr	sub_E7C7	; Print	text string from pointer table
		rts
; End of function sub_64CD


; =============== S U B	R O U T	I N E =======================================


sub_64E2:
		jsr	sub_D91A
		ldd	#0
		std	word_4B0C	; Attract text position	for scrolling
		std	>byte_48AF
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_64E2


; =============== S U B	R O U T	I N E =======================================


sub_64F1:
		jsr	sub_6112	; Accounting time stats
		jsr	sub_BE20	; Display accounting screen
		jsr	sub_D923	; Called from attract screen 1
		jsr	sub_612F	; Vector instructions end
		lda	<DPbyte_AC
		anda	#4
		beq	loc_6507
		lda	#3
		sta	<DPbyte_41	; Game mode/screen state

loc_6507:
		lda	>word_481E
		anda	#$10
		beq	locret_6512
		lda	#5
		sta	<DPbyte_41	; Game mode/screen state

locret_6512:
		rts
; End of function sub_64F1


; =============== S U B	R O U T	I N E =======================================


sub_6513:
		jsr	sub_D91A
		lda	#$A
		sta	word_4AF6
		lda	#0
		sta	byte_4598
		sta	word_4AF6+1
		lda	#3
		jsr	sub_C2C3
		beq	loc_652F
		lda	#3
		jsr	loc_C369

loc_652F:				; Game mode/screen state
		inc	<DPbyte_41
		rts
; End of function sub_6513


; =============== S U B	R O U T	I N E =======================================


sub_6532:

; FUNCTION CHUNK AT F261 SIZE 000000CD BYTES
; FUNCTION CHUNK AT F36E SIZE 000001AF BYTES
; FUNCTION CHUNK AT F520 SIZE 000001ED BYTES
; FUNCTION CHUNK AT F720 SIZE 00000003 BYTES
; FUNCTION CHUNK AT FD07 SIZE 0000007E BYTES
; FUNCTION CHUNK AT FF24 SIZE 00000033 BYTES

		jsr	sub_6112	; Game options
		jsr	sub_C450
		ldd	#$6780
		std	,y++
		ldb	#$66 ; 'f'
		addb	word_4AF6
		jsr	sub_E7D3
		lda	word_4AF6
		jsr	sub_C5A4
		jsr	sub_C4EB
		jsr	sub_D923	; Called from attract screen 1
		jsr	sub_612F	; Vector instructions end
		lda	<DPbyte_AC
		anda	#4
		beq	loc_655D
		jmp	Reset
; ---------------------------------------------------------------------------

loc_655D:
		lda	>word_481E
		anda	#$10
		beq	locret_656B
		jsr	sub_D91A
		lda	#5
		sta	<DPbyte_41	; Game mode/screen state

locret_656B:
		rts
; End of function sub_6532


; =============== S U B	R O U T	I N E =======================================

; Start	select screen

sub_656C:
		ldd	#$100
		std	word_4B0E	; Attract screen/game phase  timer
		ldd	#0
		std	word_4B0C	; Attract text position	for scrolling
		std	>byte_48AF
		ldd	#$6480
		std	byte_4B10	; Attract text colour/intensity	for fading
		jsr	sub_D91A
		ldb	#$2C ; ','

loc_6586:
		tfr	b, a
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text
		incb
		cmpb	#$3A ; ':'
		bcs	loc_6586
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_656C

; ---------------------------------------------------------------------------
word_6593:	fdb $64
		fdb $FE70
		fdb $FED4
		fdb 0
		fdb $64
		fdb $190

; =============== S U B	R O U T	I N E =======================================


sub_659F:
		ldd	word_4B0E	; Attract screen/game phase  timer
		subd	#1
		std	word_4B0E	; Attract screen/game phase  timer
		bpl	loc_65BD
		lda	#0
		sta	byte_4B15
		lda	#$1B
		sta	<DPbyte_41	; Game mode/screen state
		clr	>byte_481B
		clr	>byte_481A
		clr	>byte_4819
		rts
; ---------------------------------------------------------------------------

loc_65BD:				; Insert vector	data for four blue dots	in screen corners
		jsr	sub_6112
		ldx	#word_6593

loc_65C3:
		ldd	,x++
		anda	#$1F
		std	,y++
		ldd	,x++
		anda	#$1F
		std	,y++
		ldd	#$7200
		std	,y++
		ldd	#$BE50
		std	,y++
		cmpx	#$659F
		bcs	loc_65C3
		lda	<DPbyte_DD
		bpl	loc_65E7
		ldd	#$6380
		bra	loc_65EA
; ---------------------------------------------------------------------------

loc_65E7:
		ldd	#$6680

loc_65EA:
		std	,y++
		jsr	sub_B6C0	; Insert vector	instructions at	joystick position for laser explosion 3
		jsr	sub_D923	; Called from attract screen 1
		ldd	#$C8 ; '»'
		std	,y++
		ldd	#$1FF0
		std	,y++
		ldd	word_4B0E	; Attract screen/game phase  timer
		aslb
		rola
		aslb
		rola
		aslb
		rola
		cmpa	#$A
		bcs	loc_660B
		adda	#6

loc_660B:				; Display BCD numbers
		jsr	Display_Vect_BCD
		jsr	sub_612F	; Vector instructions end
		lda	#$FF
		sta	<DPbyte_DD
		ldx	#word_6593

loc_6618:
		ldd	<DPbyte_7B
		addd	#$FF98
		subd	,x
		tsta
		bpl	loc_6626
		coma
		negb
		sbca	#$FF

loc_6626:
		std	byte_4AFA
		cmpd	#$48 ; 'H'
		bcc	loc_6668
		ldd	<DPbyte_79
		subd	2,x
		tsta
		bpl	loc_663A
		coma
		negb
		sbca	#$FF

loc_663A:
		cmpd	#$34 ; '4'
		bcc	loc_6668
		addd	byte_4AFA
		cmpd	#$50 ; 'P'
		bcc	loc_6668
		tfr	x, d
		subd	#word_6593
		lsrb
		stb	<DPbyte_DD
		stb	byte_4B15
		lda	<DPbyte_AC
		anda	#$F0 ; ''
		beq	locret_6667
		lda	#$1B
		sta	<DPbyte_41	; Game mode/screen state
		clr	>byte_481B
		clr	>byte_481A
		clr	>byte_4819

locret_6667:
		rts
; ---------------------------------------------------------------------------

loc_6668:
		leax	4,x
		cmpx	#sub_659F
		bcs	loc_6618
		rts
; End of function sub_659F


; =============== S U B	R O U T	I N E =======================================


sub_6670:
		ldd	#0
		std	word_4B0E	; Attract screen/game phase  timer
		std	word_4B0C	; Attract text position	for scrolling
		std	>byte_48AF
		ldd	#$6180
		std	byte_4B10	; Attract text colour/intensity	for fading
		jsr	sub_D91A
		lda	#$3A ; ':'
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text
		lda	#$3B ; ';'
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text
		lda	#$3C ; '<'
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text
		lda	#$3D ; '='
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text
		lda	#$3E ; '>'
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text
		lda	#$3D ; '='
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text
		jsr	Sound_1C
		jsr	loc_CC38
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_6670


; =============== S U B	R O U T	I N E =======================================


sub_66AC:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		jsr	sub_761D	; Display score
		jsr	sub_63D5	; Check	credits	status
		jsr	sub_C7FD	; Display high scores
		jsr	sub_D923	; Called from attract screen 1
		jsr	sub_612F	; Vector instructions end
		jsr	sub_CAF3
		lda	>word_481E
		anda	#$10
		bne	loc_66CE
		ldd	#$300
		std	word_4B0E	; Attract screen/game phase  timer

loc_66CE:				; Attract screen/game phase  timer
		ldd	word_4B0E
		addd	#1
		std	word_4B0E	; Attract screen/game phase  timer
		cmpd	#$280
		bcs	loc_66E3
		ldd	#$FFFF
		std	word_4AEC

loc_66E3:
		ldd	word_4AEC
		bpl	locret_6707
		lda	#$B
		sta	<DPbyte_41	; Game mode/screen state
		ldu	#byte_4AB6
		ldx	#$4520
		lda	#8
		jsr	loc_C6F9
		ldu	#byte_4A8E	; High scores RAM
		ldx	#$4508
		lda	#$B
		jsr	loc_C6F9
		lda	#1
		jsr	sub_C2B3

locret_6707:
		rts
; End of function sub_66AC


; =============== S U B	R O U T	I N E =======================================

; Called once before attract screen 2

sub_6708:
		inc	<DPbyte_41	; Game mode/screen state
		jsr	sub_611E	; Copies Star Wars logo	vector data to vector RAM

loc_670D:
		jsr	sub_D91A
		ldd	#0
		std	word_4B0C	; Attract text position	for scrolling
		std	>byte_48AF
		jsr	sub_D9DC	; Initialise before game start
		jsr	sub_61B5	; Set up math constants
		jsr	sub_615A	; More stars/ties init stuff

loc_6722:				; Matrix 2
		ldu	#MReg1C

loc_6725:				; Initialise math registers matrix
		jsr	sub_CDC3
		lda	byte_4B34
		cmpa	#$FF
		bne	loc_6737
		lda	byte_4B06
		sta	byte_4B34
		bra	locret_6758
; ---------------------------------------------------------------------------

loc_6737:				; Called once before attract screen 2
		lda	byte_4B06
		cmpa	byte_4B34
		beq	locret_6758
		sta	byte_4B34
		jsr	sub_C20C
		lda	byte_4592
		anda	#4
		bne	locret_6758
		ldx	#off_6759
		lda	PRNG
		ldb	#9
		mul
		asla
		jsr	[a,x]		; Play random attract sound

locret_6758:
		rts
; End of function sub_6708

; ---------------------------------------------------------------------------
off_6759:	fdb Sound_1B		; High score
		fdb Sound_1C
		fdb Sound_1F		; Death	Star destroyed
		fdb Sound_22		; Trench music
off_6761:	fdb Sound_25		; Space	Wave 2 music
		fdb Sound_24		; Space	wave 1 music
		fdb Sound_21		; Towers 2 music
		fdb Sound_20		; Towers 1 music
		fdb Sound_1D		; Imperial March

; =============== S U B	R O U T	I N E =======================================


sub_676B:
		jsr	sub_6112	; Attract screen 2
		jsr	sub_CD80	; Starfield
		jsr	sub_D9FA
		jsr	sub_D985
		jsr	sub_63D5	; Check	credits	status
		jsr	sub_761D	; Display score
		jsr	sub_612F	; Vector instructions end

loc_6780:				; Attract screen 2 stars forward and down translate
		jsr	sub_6DA5
		jsr	sub_622D	; Check	joystick X to show high	scores if moved
		rts
; End of function sub_676B


; =============== S U B	R O U T	I N E =======================================

; Called once before difficulty	select screen

sub_6787:
		lda	#5
		sta	word_4B0E	; Attract screen/game phase  timer
		lda	#$FF
		sta	byte_4B34
		jsr	sub_D91A
		jsr	Sound_10
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_6787


; =============== S U B	R O U T	I N E =======================================

; Called once before difficulty	select screen

sub_679A:
		lda	#$D
		sta	<DPbyte_41	; Game mode/screen state
		ldd	#0
		std	<DPbyte_42
		sta	<DPbyte_DD
		lda	byte_4593
		anda	#3

loc_67AA:
		adda	#6
		sta	<DPbyte_60	; Shield count
		sta	<DPbyte_8E
		lda	byte_4593
		lsra
		lsra
		anda	#3
		sta	byte_4B18
		lda	#0
		sta	byte_4B17
		sta	<DPbyte_8B
		sta	<DPbyte_8C	; Sheild being depleted
		sta	<DPbyte_5C	; Score	millions
		sta	<DPbyte_5D	; Score	hundred	thousands
		sta	<DPbyte_5E	; Score	thousands
		sta	<DPbyte_5F	; Score
		sta	byte_4B2D
		sta	byte_4B37

loc_67D1:
		sta	byte_4B35

loc_67D4:
		orcc	#$10
		inc	>byte_486F
		inc	>byte_4866
		inc	>byte_4871
		inc	>byte_4868
		andcc	#$EF ; 'Ô'
		rts
; End of function sub_679A


; =============== S U B	R O U T	I N E =======================================


sub_67E5:
		jsr	sub_61B5	; Set up math constants
		jsr	sub_615A	; More stars/ties init stuff
		jsr	sub_61EC	; Init stars math data
		lda	#$C0 ; '¿'
		sta	MReg40		; Matrix 4
		sta	MReg45
		lda	#0
		sta	>byte_4813
		inc	<DPbyte_41	; Game mode/screen state

loc_67FD:
		lda	#$1D
		sta	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_67E5


; =============== S U B	R O U T	I N E =======================================

; Next space wave after	Death Star explosion

sub_6802:
		jsr	loc_7A5A
		ldx	#8
		lda	byte_4B15
		inca
		jsr	sub_7720
		lda	word_4AD6
		sta	byte_4B16
		lda	byte_4B15

loc_6818:
		cmpa	#$1F
		bls	loc_681E
		lda	#$1F

loc_681E:
		sta	byte_4B14
		adda	byte_4B18
		cmpa	#$F
		bls	loc_682A
		lda	#$F

loc_682A:
		sta	byte_4B19
		inc	<DPbyte_41	; Game mode/screen state

loc_682F:
		lda	#$1F
		sta	<DPbyte_41	; Game mode/screen state
		lda	#0
		sta	<DPbyte_DD
		rts
; End of function sub_6802


; =============== S U B	R O U T	I N E =======================================

; Next space wave after	Death Star explosion

sub_6838:

; FUNCTION CHUNK AT 6C76 SIZE 0000000E BYTES

		jsr	sub_6161	; Initialise tie fighters and fireballs
		jsr	sub_B939
		ldd	#0
		std	word_4B0E	; Attract screen/game phase  timer
		sta	word_4B3B
		lda	#9
		sta	word_4B3B+1
		lda	byte_4B2D
		bne	loc_6857
		ldd	#$27 ; '''
		std	word_4B0E	; Attract screen/game phase  timer

loc_6857:				; Game mode/screen state
		inc	<DPbyte_41

loc_6859:				; Space	wave
		jsr	sub_72C7
		lda	<DPbyte_60	; Shield count
		lbmi	loc_6C76

loc_6862:				; Fireball movement
		jsr	sub_A849
		jsr	sub_9898
		jsr	sub_B98B	; Check	if tie/bunker/tower been hit
		jsr	sub_9890	; Fireball timer 3
		jsr	sub_9558	; Process shields
		jsr	sub_8B6D
		jsr	sub_70DB
		jsr	sub_6DD2
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_6F5F
		ldd	word_4B0E	; Attract screen/game phase  timer
		addd	#1
		std	word_4B0E	; Attract screen/game phase  timer
		cmpd	#$28 ; '('
		bne	loc_68A6
		lda	byte_4B15
		cmpa	#3
		blt	loc_68A1
		anda	#1
		beq	loc_68A1
		jsr	Sound_1D	; Imperial March
		bra	loc_68A4
; ---------------------------------------------------------------------------

loc_68A1:				; Space	wave 1 music
		jsr	Sound_24

loc_68A4:
		bra	loc_68C6
; ---------------------------------------------------------------------------

loc_68A6:
		cmpd	#$C8 ; '»'
		bne	loc_68B1
		jsr	Sound_25	; Space	Wave 2 music
		bra	loc_68C6
; ---------------------------------------------------------------------------

loc_68B1:
		cmpd	#$190
		bne	loc_68BC
		jsr	Sound_1E	; Enter	Death Star
		bra	loc_68C6
; ---------------------------------------------------------------------------

loc_68BC:
		cmpd	#$1A4
		bcs	loc_68C6
		lda	#$21 ; '!'
		sta	<DPbyte_41	; Game mode/screen state

loc_68C6:
		lda	<DPbyte_E6
		cmpa	#3
		bcc	locret_68CF
		jsr	sub_8F7B

locret_68CF:
		rts
; End of function sub_6838


; =============== S U B	R O U T	I N E =======================================


sub_68D0:
		inc	word_4B3B
		inc	<DPbyte_41	; Game mode/screen state

loc_68D5:				; Entering Death Star
		jsr	sub_72C7
		lda	<DPbyte_60	; Shield count
		lbmi	loc_6C76
		jsr	sub_A849	; Fireball movement
		jsr	sub_9898
		jsr	sub_B98B	; Check	if tie/bunker/tower been hit
		jsr	sub_9890	; Fireball timer 3
		jsr	sub_9558	; Process shields
		jsr	sub_8B86
		jsr	sub_70DB
		jsr	sub_6DFA
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_6F5F
		ldx	#byte_4900	; 3x Tie fighter data structure	($19 bytes per Tie)

loc_6901:
		lda	3,x
		bne	locret_6911
		leax	$19,x
		cmpx	#byte_4900+$4B	; 3x Tie fighter data structure	($19 bytes per Tie)
		bcs	loc_6901
		lda	#$23 ; '#'
		sta	<DPbyte_41	; Game mode/screen state

locret_6911:
		rts
; End of function sub_68D0


; =============== S U B	R O U T	I N E =======================================


sub_6912:
		ldd	#$7780
		std	<DPbyte_56	; Zoom value
		ldd	#$100
		std	<DPbyte_58	; Death	Star zoom value
		lda	byte_4B2D
		bne	loc_692A
		lda	byte_4B14
		cmpa	#4
		bne	loc_692A
		bra	loc_6930
; ---------------------------------------------------------------------------

loc_692A:				; Red 5	I'm going in
		jsr	Sound_17

loc_692D:				; R2 beeps entering Death Star
		jsr	Sound_32

loc_6930:				; Game mode/screen state
		inc	<DPbyte_41
		rts
; End of function sub_6912


; =============== S U B	R O U T	I N E =======================================

; Entering Death Star 2nd part

sub_6933:
		jsr	sub_733C	; End of space wave? Also Trench catwalks
		jsr	sub_B98B	; Check	if tie/bunker/tower been hit
		jsr	sub_9890	; Fireball timer 3
		jsr	sub_9558	; Process shields
		jsr	sub_6DD2
		jsr	sub_6F67
		ldd	MReg40		; Matrix 4
		cmpd	#$3F00
		blt	locret_6952
		lda	#$25 ; '%'
		sta	<DPbyte_41	; Game mode/screen state

locret_6952:
		rts
; End of function sub_6933


; =============== S U B	R O U T	I N E =======================================


sub_6953:
		lda	byte_4B2D
		bne	loc_6962
		lda	byte_4B14
		cmpa	#4
		bne	loc_6962
		jsr	Sound_13	; Look at the size of that thing

loc_6962:
		jsr	Sound_38
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_6953


; =============== S U B	R O U T	I N E =======================================

; Entering Death Star zoom in

sub_6968:
		jsr	sub_736F
		jsr	sub_9898
		jsr	sub_9890	; Fireball timer 3
		jsr	sub_9558	; Process shields
		jsr	sub_6DD2

loc_6977:
		jsr	sub_6F67
		ldb	<DPbyte_58	; Death	Star zoom value
		negb
		sex
		addd	<DPbyte_56	; Zoom value
		andb	#$7F ; ''
		std	<DPbyte_56	; Zoom value
		cmpd	#$7310
		bhi	loc_6997
		lda	byte_4B14
		bne	loc_6993
		lda	#$27 ; '''
		bra	loc_6995
; ---------------------------------------------------------------------------

loc_6993:
		lda	#$29 ; ')'

loc_6995:				; Game mode/screen state
		sta	<DPbyte_41

loc_6997:				; Death	Star zoom value
		ldd	<DPbyte_58
		addd	#$60 ; '`'
		std	<DPbyte_58	; Death	Star zoom value
		lda	<DPbyte_83	; Star intensity
		suba	#2
		bhi	loc_69A6
		lda	#0

loc_69A6:				; Star intensity
		sta	<DPbyte_83
		rts
; End of function sub_6968


; =============== S U B	R O U T	I N E =======================================

; Towers/Bunkers init

sub_69A9:
		lda	byte_4B15
		deca
		cmpa	#$1F
		bcs	loc_69B3
		lda	#$1F

loc_69B3:
		sta	byte_4B13
		adda	byte_4B18
		cmpa	#$F
		bls	loc_69BF
		lda	#$F

loc_69BF:
		sta	byte_4B19
		jsr	sub_615A	; More stars/ties init stuff
		jsr	sub_620F	; Init towers surface dots
		jsr	sub_A1CE
		jsr	sub_B939
		ldd	#$100
		std	MReg43
		asra
		rorb
		std	MReg4C
		ldd	#$2000
		std	MReg4E
		lda	#0
		sta	<DPbyte_A7
		sta	byte_4B35
		sta	byte_4B3D
		lda	#0
		sta	word_4B0E	; Attract screen/game phase  timer
		jsr	Sound_20	; Towers 1 music
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_69A9


; =============== S U B	R O U T	I N E =======================================

; Towers/Bunkers wave

sub_69F4:

; FUNCTION CHUNK AT 6CB6 SIZE 0000000E BYTES

		jsr	sub_7390	; Towers/Bunkers wave
		lda	<DPbyte_60	; Shield count
		lbmi	loc_6CB6
		jsr	sub_A849	; Fireball movement
		jsr	sub_9890	; Fireball timer 3
		jsr	sub_9558	; Process shields
		jsr	sub_B98B	; Check	if tie/bunker/tower been hit
		jsr	sub_70DB
; End of function sub_69F4


; =============== S U B	R O U T	I N E =======================================


sub_6A0C:
		jsr	sub_6E22
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_6F6F
		ldd	MReg43
		addd	#1
		cmpd	#$400
		bhi	loc_6A26
		std	MReg43

loc_6A26:				; Game over/insert coins timer
		lda	<DPbyte_43
		anda	#$F
		bne	loc_6A39
		lda	word_4B0E	; Attract screen/game phase  timer
		cmpa	#$E
		bne	loc_6A36
		jsr	Sound_21	; Towers 2 music

loc_6A36:				; Attract screen/game phase  timer
		inc	word_4B0E

loc_6A39:
		lda	<DPbyte_A7
		cmpa	#5
		bcs	locret_6A4F
		lda	#1
		sta	byte_4B3D
		lda	MReg4C
		cmpa	#$80 ; 'Ä'
		bcc	locret_6A4F
		lda	#$2B ; '+'
		sta	<DPbyte_41	; Game mode/screen state

locret_6A4F:
		rts
; End of function sub_6A0C


; =============== S U B	R O U T	I N E =======================================

; Entering Death Star zoomed fully in

sub_6A50:
		lda	#0
		sta	<DPbyte_98
		sta	byte_4B36
		lda	byte_4B15
		cmpa	#$1F
		bls	loc_6A60
		lda	#$1F

loc_6A60:
		sta	byte_4B12
		adda	byte_4B18
		cmpa	#$F
		bls	loc_6A6C
		lda	#$F

loc_6A6C:
		sta	byte_4B19
		jsr	sub_83A4	; Called when starting trench
		jsr	Sound_19
		ldd	#0
		std	word_4B0E	; Attract screen/game phase  timer
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_6A50


; =============== S U B	R O U T	I N E =======================================


sub_6A7E:
		jsr	sub_615A	; More stars/ties init stuff
		jsr	sub_8341	; Entering trench
		lda	#$2F ; '/'
		sta	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_6A7E


; =============== S U B	R O U T	I N E =======================================


sub_6A89:
		jsr	sub_73EA	; Towers
		jsr	sub_9890	; Fireball timer 3
		jsr	sub_9558	; Process shields
		jsr	sub_B98B	; Check	if tie/bunker/tower been hit
		jsr	sub_6FE0
		ldd	word_4B0E	; Attract screen/game phase  timer
		addd	#1

loc_6A9E:				; Attract screen/game phase  timer
		std	word_4B0E
		subd	#$11
		bcs	locret_6AAA
		lda	#$2D ; '-'
		sta	<DPbyte_41	; Game mode/screen state

locret_6AAA:
		rts
; End of function sub_6A89


; =============== S U B	R O U T	I N E =======================================


sub_6AAB:
		ldd	#0
		std	MReg4C
		std	MReg4D
		std	word_4B0E	; Attract screen/game phase  timer
		jsr	sub_6FF1
		jsr	sub_8341	; Entering trench
		inc	<DPbyte_41	; Game mode/screen state

loc_6ABF:
		jsr	sub_7413
		jsr	sub_9890	; Fireball timer 3
		jsr	sub_9558	; Process shields
		jsr	sub_B98B	; Check	if tie/bunker/tower been hit
		jsr	sub_6FF1
		ldd	word_4B0E	; Attract screen/game phase  timer
		addd	#1
		std	word_4B0E	; Attract screen/game phase  timer
		subd	#$11
		bcs	locret_6AFE
		ldx	MReg4C
		ldu	MReg4D
		ldd	MReg4E
		pshs	a,b,x,u
		jsr	sub_615A	; More stars/ties init stuff
		puls	u,x,b,a
		stx	MReg4C
		stu	MReg4D
		std	MReg4E
		lda	#0
		sta	byte_4B36
		lda	#$2F ; '/'
		sta	<DPbyte_41	; Game mode/screen state

locret_6AFE:
		rts
; End of function sub_6AAB


; =============== S U B	R O U T	I N E =======================================


sub_6AFF:
		lda	#1
		sta	<DPbyte_98
		jsr	sub_615A	; More stars/ties init stuff
		jsr	sub_8341	; Entering trench
		lda	#$FF
		sta	byte_4B36
		lda	byte_4B19
		adda	byte_4B17
		cmpa	#$F
		bls	loc_6B1A
		lda	#$F

loc_6B1A:
		sta	byte_4B19

loc_6B1D:
		lda	#$2F ; '/'
		sta	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_6AFF


; =============== S U B	R O U T	I N E =======================================


sub_6B22:

; FUNCTION CHUNK AT 6CE1 SIZE 0000000E BYTES

		lda	#0
		sta	byte_4B3E
		sta	word_4B0E	; Attract screen/game phase  timer
		ldd	#$300
		std	MReg43
		inc	<DPbyte_41	; Game mode/screen state

loc_6B32:				; Trench
		jsr	sub_743C
		lda	<DPbyte_60	; Shield count
		lbmi	loc_6CE1
		jsr	sub_A849	; Fireball movement
		jsr	sub_AD6C
		jsr	sub_8495
		jsr	sub_9886	; Fireball timer 2
		jsr	sub_9558	; Process shields
		jsr	sub_70DB
		jsr	nullsub_1
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_703B	; Trench viewpoint calc
		lda	<DPbyte_43	; Game over/insert coins timer
		anda	#$F
		bne	loc_6B99
		lda	word_4B0E	; Attract screen/game phase  timer
		cmpa	#2
		bne	loc_6B68
		jsr	Sound_22	; Trench music

loc_6B68:
		lda	byte_4B12
		lsra
		bcs	loc_6B83
		lda	word_4B0E	; Attract screen/game phase  timer
		cmpa	#$10
		bne	loc_6B7A
		jsr	Sound_18	; Luke trust me
		bra	loc_6B81
; ---------------------------------------------------------------------------

loc_6B7A:
		cmpa	#$18
		bne	loc_6B81
		jsr	Sound_1A	; Yahoo	you're all clear kid

loc_6B81:
		bra	loc_6B96
; ---------------------------------------------------------------------------

loc_6B83:				; Attract screen/game phase  timer
		lda	word_4B0E
		cmpa	#$10
		bne	loc_6B8F
		jsr	Sound_C
		bra	loc_6B96
; ---------------------------------------------------------------------------

loc_6B8F:
		cmpa	#$16
		bne	loc_6B96
		jsr	Sound_16	; Force	is strong in this one

loc_6B96:				; Attract screen/game phase  timer
		inc	word_4B0E

loc_6B99:
		lda	<DPbyte_92
		beq	locret_6BDA
		ldd	<DPbyte_93
		subd	MReg4C
		subd	#$800
		bhi	locret_6BDA
		lda	>word_4845
		bne	loc_6BC6
		lda	#1
		sta	byte_4B3E
		jsr	Sound_26	; Explosion
		jsr	sub_9874
		lda	<DPbyte_60	; Shield count
		lble	loc_6CE1
		lda	#$31 ; '1'
		sta	<DPbyte_41	; Game mode/screen state
		jsr	Sound_E
		bra	locret_6BDA
; ---------------------------------------------------------------------------

loc_6BC6:
		lda	#$11
		sta	<DPbyte_41	; Game mode/screen state
		lda	byte_4B15
		cmpa	#3
		blt	locret_6BDA
		anda	#1
		beq	locret_6BDA
		jsr	Sound_7
		bra	*+2

locret_6BDA:
		rts
; End of function sub_6B22


; =============== S U B	R O U T	I N E =======================================


sub_6BDB:
		jsr	sub_61B5	; Set up math constants
		jsr	sub_615A	; More stars/ties init stuff
		lda	#$C0 ; '¿'
		sta	MReg40		; Matrix 4
		sta	MReg45
		lda	#4
		sta	word_4B0E	; Attract screen/game phase  timer
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_6BDB


; =============== S U B	R O U T	I N E =======================================

; Death	Star explosion complete

sub_6BF1:
		lda	<DPbyte_43	; Game over/insert coins timer
		anda	#$F
		bne	loc_6C2C
		dec	word_4B0E	; Attract screen/game phase  timer
		lda	word_4B0E	; Attract screen/game phase  timer
		cmpa	#3
		bne	loc_6C09
		lda	>word_4845
		beq	loc_6C09
		jsr	loc_9806	; Exhaust port score

loc_6C09:				; Attract screen/game phase  timer
		lda	word_4B0E
		cmpa	#2
		bne	loc_6C13
		jsr	sub_9775	; Shield bonus score

loc_6C13:				; Attract screen/game phase  timer
		lda	word_4B0E
		cmpa	#1
		bne	loc_6C22
		lda	>word_4845
		beq	loc_6C22
		jsr	sub_953B

loc_6C22:				; Attract screen/game phase  timer
		lda	word_4B0E
		cmpa	#0
		bne	loc_6C2C
		jsr	sub_9722	; Death	Star starting wave bonus score

loc_6C2C:
		jsr	sub_7519
		jsr	sub_9558	; Process shields
		jsr	sub_6F5F
		lda	word_4B0E	; Attract screen/game phase  timer
		cmpa	#$FE ; '˛'
		bne	locret_6C75
		lda	byte_4B15
		inca
		cmpa	#$62 ; 'b'
		bls	loc_6C46
		lda	#$62 ; 'b'

loc_6C46:
		sta	byte_4B15
		lda	byte_4B15
		cmpa	#5
		bcc	loc_6C5D
		lda	byte_4B17
		inca
		cmpa	#4
		bls	loc_6C5A
		lda	#4

loc_6C5A:
		sta	byte_4B17

loc_6C5D:
		lda	byte_4B18
		adda	byte_4B17
		cmpa	#$F
		bls	loc_6C69
		lda	#$F

loc_6C69:
		sta	byte_4B18
		lda	#$FF
		sta	byte_4B2D
		lda	#$1D
		sta	<DPbyte_41	; Game mode/screen state

locret_6C75:
		rts
; End of function sub_6BF1

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_6838

loc_6C76:				; Stay in attack formation
		jsr	Sound_14
		lda	#$36 ; '6'
		sta	<DPbyte_41	; Game mode/screen state
		ldd	#0
		std	word_4B0E	; Attract screen/game phase  timer
		rts
; END OF FUNCTION CHUNK	FOR sub_6838

; =============== S U B	R O U T	I N E =======================================


sub_6C84:
		jsr	sub_7315
		jsr	sub_A849	; Fireball movement
		jsr	sub_987F	; Fireball timer
		jsr	sub_9898
		jsr	sub_B98B	; Check	if tie/bunker/tower been hit
		ldd	#$FB01
		std	MReg11		; Sine for rotation
		ldd	#$3FCE
		std	MReg12		; Cosine for rotation
		jsr	sub_CE24	; Run math program $00 Roll
		ldd	word_4B0E	; Attract screen/game phase  timer
		addd	#1
		std	word_4B0E	; Attract screen/game phase  timer
		cmpd	#$28 ; '('
		bcs	locret_6CB5
		lda	#$3B ; ';'
		sta	<DPbyte_41	; Game mode/screen state

locret_6CB5:
		rts
; End of function sub_6C84

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_69F4

loc_6CB6:				; Stay in attack formation
		jsr	Sound_14
		lda	#$38 ; '8'
		sta	<DPbyte_41	; Game mode/screen state
		ldd	#0
		std	word_4B0E	; Attract screen/game phase  timer
		rts
; END OF FUNCTION CHUNK	FOR sub_69F4

; =============== S U B	R O U T	I N E =======================================


sub_6CC4:
		jsr	sub_73C3	; Towers
		jsr	sub_A849	; Fireball movement
		jsr	sub_987F	; Fireball timer
		ldd	word_4B0E	; Attract screen/game phase  timer
		addd	#1
		std	word_4B0E	; Attract screen/game phase  timer
		cmpd	#$28 ; '('
		bcs	locret_6CE0
		lda	#$3B ; ';'
		sta	<DPbyte_41	; Game mode/screen state

locret_6CE0:
		rts
; End of function sub_6CC4

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_6B22

loc_6CE1:				; Stay in attack formation
		jsr	Sound_14
		lda	#$3A ; ':'
		sta	<DPbyte_41	; Game mode/screen state
		ldd	#0
		std	word_4B0E	; Attract screen/game phase  timer
		rts
; END OF FUNCTION CHUNK	FOR sub_6B22

; =============== S U B	R O U T	I N E =======================================

; Game over

sub_6CEF:
		jsr	sub_74D5	; Game over
		jsr	sub_A849	; Fireball movement
		jsr	sub_987F	; Fireball timer
		ldd	word_4B0E	; Attract screen/game phase  timer
		addd	#1
		std	word_4B0E	; Attract screen/game phase  timer
		cmpd	#$28 ; '('
		bcs	locret_6D0B
		lda	#$3B ; ';'
		sta	<DPbyte_41	; Game mode/screen state

locret_6D0B:
		rts
; End of function sub_6CEF


; =============== S U B	R O U T	I N E =======================================

; Game over init

sub_6D0C:
		jsr	Sound_11	; Remember
		jsr	Sound_5
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_6D0C


; =============== S U B	R O U T	I N E =======================================

; Game over

sub_6D15:
		jsr	sub_61B5	; Set up math constants
		jsr	sub_615A	; More stars/ties init stuff
		jsr	sub_61EC	; Init stars math data
		ldu	#MReg1C		; Matrix 2
		jsr	sub_CDC3	; Initialise math registers matrix
		jsr	sub_C0FF	; NVRAM	something
		jsr	sub_CA8C	; Score
		lda	word_4AEC
		bmi	loc_6D33
		lda	#$F
		bra	loc_6D38
; ---------------------------------------------------------------------------

loc_6D33:				; High score
		jsr	Sound_1B
		lda	#5

loc_6D38:				; Game mode/screen state
		sta	<DPbyte_41
		rts
; End of function sub_6D15


; =============== S U B	R O U T	I N E =======================================


sub_6D3B:
		ldd	#$7304		; Exhaust port hit init
		std	<DPbyte_56	; Zoom value
		ldd	#$AFF
		std	<DPbyte_58	; Death	Star zoom value
		jsr	sub_61EC	; Init stars math data
		ldu	#MReg1C		; Matrix 2
		jsr	sub_CDC3	; Initialise math registers matrix
		inc	<DPbyte_41	; Game mode/screen state
		jsr	Sound_1F	; Death	Star destroyed
		rts
; End of function sub_6D3B


; =============== S U B	R O U T	I N E =======================================


sub_6D54:
		jsr	sub_75B9	; Death	Star hit zoom out
		jsr	sub_9558	; Process shields
		jsr	sub_9890	; Fireball timer 3
		ldb	<DPbyte_58	; Death	Star zoom value
		sex
		addd	<DPbyte_56	; Zoom value
		addd	#$80 ; 'Ä'
		andb	#$7F ; ''
		std	<DPbyte_56	; Zoom value
		cmpd	#$7680
		bcs	loc_6D73
		lda	#$13
		sta	<DPbyte_41	; Game mode/screen state

loc_6D73:				; Death	Star zoom value
		ldd	<DPbyte_58
		subd	#$10
		bpl	loc_6D7D
		ldd	#0

loc_6D7D:				; Death	Star zoom value
		std	<DPbyte_58
		rts
; End of function sub_6D54


; =============== S U B	R O U T	I N E =======================================


sub_6D80:
		jsr	sub_BB7B	; Death	Star explosion init
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_6D80


; =============== S U B	R O U T	I N E =======================================

; Space	wave init

sub_6D86:
		jsr	sub_75D9	; Space	wave
		lda	>word_48A1
		cmpa	#1
		bcs	locret_6D94
		lda	#$15
		sta	<DPbyte_41	; Game mode/screen state

locret_6D94:
		rts
; End of function sub_6D86


; =============== S U B	R O U T	I N E =======================================


sub_6D95:
		inc	<DPbyte_41	; Game mode/screen state
		rts
; End of function sub_6D95


; =============== S U B	R O U T	I N E =======================================


sub_6D98:
		jsr	sub_760A	; Death	Star explosion
		lda	>word_48A1
		bne	locret_6DA4
		lda	#$33 ; '3'
		sta	<DPbyte_41	; Game mode/screen state

locret_6DA4:
		rts
; End of function sub_6D98


; =============== S U B	R O U T	I N E =======================================

; Attract screen 2 stars forward and down translate

sub_6DA5:
		ldd	<Stars_XT
		addd	#$80 ; 'Ä'      ; Increment Stars XT
		std	<Stars_XT
		ldd	Stars_ZT
		addd	#$80 ; 'Ä'
		std	Stars_ZT
		rts
; End of function sub_6DA5


; =============== S U B	R O U T	I N E =======================================

; Attract screen 3 stars YT move

sub_6DB6:
		ldd	Stars_YT
		addd	#$FF80
		std	Stars_YT
		rts
; End of function sub_6DB6


; =============== S U B	R O U T	I N E =======================================

; Attract screen 4 stars ZT move

sub_6DC0:
		ldd	Stars_ZT
		addd	#$80 ; 'Ä'
		std	Stars_ZT
		rts
; End of function sub_6DC0


; =============== S U B	R O U T	I N E =======================================

; Move stars XT	translate position

sub_6DCA:
		ldd	<Stars_XT
		addd	#$80 ; 'Ä'
		std	<Stars_XT
		rts
; End of function sub_6DCA


; =============== S U B	R O U T	I N E =======================================


sub_6DD2:
		lda	<DPbyte_63
		beq	loc_6DF0
		ble	loc_6DDF
		dec	<DPbyte_63
		ldd	#$4FF
		bra	loc_6DE4
; ---------------------------------------------------------------------------

loc_6DDF:
		inc	<DPbyte_63
		ldd	#$FB01

loc_6DE4:				; Sine for rotation
		std	MReg11
		ldd	#$3FCE
		std	MReg12		; Cosine for rotation
		jsr	sub_CE24	; Run math program $00 Roll

loc_6DF0:
		jsr	sub_6EA2
		jsr	sub_70BD
		jsr	sub_70CC
		rts
; End of function sub_6DD2


; =============== S U B	R O U T	I N E =======================================


sub_6DFA:
		lda	<DPbyte_63
		beq	loc_6E18
		ble	loc_6E07
		dec	<DPbyte_63
		ldd	#$4FF
		bra	loc_6E0C
; ---------------------------------------------------------------------------

loc_6E07:
		inc	<DPbyte_63
		ldd	#$FB01

loc_6E0C:				; Sine for rotation
		std	MReg11
		ldd	#$3FCE
		std	MReg12		; Cosine for rotation
		jsr	sub_CE24	; Run math program $00 Roll

loc_6E18:
		jsr	loc_6ECB
		jsr	sub_70BD
		jsr	sub_70CC
		rts
; End of function sub_6DFA


; =============== S U B	R O U T	I N E =======================================


sub_6E22:
		lda	<DPbyte_63
		beq	loc_6E2E
		ble	loc_6E2B
		deca
		bra	loc_6E2C
; ---------------------------------------------------------------------------

loc_6E2B:
		inca

loc_6E2C:
		sta	<DPbyte_63

loc_6E2E:
		lda	<DPbyte_63
		bpl	loc_6E33
		nega

loc_6E33:
		ldb	#$20 ; ' '
		mul
		tst	<DPbyte_63
		bpl	loc_6E3E
		coma
		negb
		sbca	#$FF

loc_6E3E:
		std	<DPbyte_A5
		lda	<DPbyte_7D	; Joystick X
		bpl	loc_6E45
		coma

loc_6E45:
		ldb	#2
		mul
		tst	<DPbyte_7D	; Joystick X
		bpl	loc_6E50
		coma
		negb
		sbca	#$FF

loc_6E50:
		addd	<DPbyte_A5
		tst	<DPbyte_63
		bne	sub_6E70	; Towers collision roll	limits
		subd	<DPbyte_A3
		ble	loc_6E65
		cmpd	#$10
		ble	loc_6E63
		ldd	#$10

loc_6E63:
		bra	loc_6E6E
; ---------------------------------------------------------------------------

loc_6E65:
		cmpd	#$FFF0
		bge	loc_6E6E
		ldd	#$FFF0

loc_6E6E:
		bra	loc_6E88
; End of function sub_6E22


; =============== S U B	R O U T	I N E =======================================

; Towers collision roll	limits

sub_6E70:
		subd	<DPbyte_A3
		ble	loc_6E7F
		cmpd	#$32 ; '2'
		ble	loc_6E7D
		ldd	#$32 ; '2'

loc_6E7D:
		bra	loc_6E88
; ---------------------------------------------------------------------------

loc_6E7F:
		cmpd	#$FFCE
		bge	loc_6E88
		ldd	#$FFCE

loc_6E88:
		tfr	b, a
		adda	>byte_4878
		sta	>byte_4878
		sex
		addd	<DPbyte_A3
		std	<DPbyte_A3
		ldx	#byte_4870
		jsr	sub_7111
		beq	locret_6EA0
		jsr	sub_CE24	; Run math program $00 Roll

locret_6EA0:
		rts
; End of function sub_6E70


; =============== S U B	R O U T	I N E =======================================


nullsub_1:
		rts
; End of function nullsub_1


; =============== S U B	R O U T	I N E =======================================


sub_6EA2:
		ldx	byte_4B32
		bne	loc_6EAA
		ldx	#byte_4900	; 3x Tie fighter data structure	($19 bytes per Tie)

loc_6EAA:
		lda	3,x
		cmpa	#1
		bne	loc_6EB9
		lda	6,x
		bne	loc_6EB9
		stx	<DPbyte_64	; Pointer to Tie fighter data
		jmp	loc_6EF7	; Point	BIC to 5080
; ---------------------------------------------------------------------------

loc_6EB9:
		lda	word_4B3B+1
		ble	loc_6EC3
		lda	#9
		sta	word_4B3B+1

loc_6EC3:
		leax	$19,x
		cmpx	#byte_4900+$4B	; 3x Tie fighter data structure	($19 bytes per Tie)
		bcs	loc_6EAA

loc_6ECB:
		ldd	#0
		std	byte_4B32
		lda	MReg40		; Matrix 4
		bmi	loc_6EDB
		ldb	MReg42
		bra	loc_6EE0
; ---------------------------------------------------------------------------

loc_6EDB:
		ldb	#$7F ; ''
		subb	MReg42

loc_6EE0:
		stb	>word_486D
		lda	MReg40		; Matrix 4
		bmi	loc_6EED
		ldb	MReg41
		bra	loc_6EF2
; ---------------------------------------------------------------------------

loc_6EED:
		ldb	#$7F ; ''
		subb	MReg41

loc_6EF2:
		comb
		stb	>byte_4876
		rts
; ---------------------------------------------------------------------------

loc_6EF7:				; BIC points to	Matrix 4
		lda	#$10
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_7160	; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		stx	byte_4B32
		clra
		ldb	2,x
		addb	#3
		std	MW1
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		lda	MReg00		; Math result X
		ble	loc_6F39
		ldd	MReg01		; Math result Y

loc_6F19:				; Math result X
		asl	MReg00+1
		rol	MReg00		; Math result X
		bvs	loc_6F54
		aslb
		rola
		bvc	loc_6F29
		rora
		rorb
		bra	loc_6F54
; ---------------------------------------------------------------------------

loc_6F29:				; Math result Z
		asl	MReg02+1
		rol	MReg02		; Math result Z
		bvc	loc_6F19
		ror	MReg02		; Math result Z
		ror	MReg02+1	; Math result Z
		bra	loc_6F54
; ---------------------------------------------------------------------------

loc_6F39:				; Math result Y
		ldd	MReg01
		orb	#1

loc_6F3E:
		aslb
		rola
		bvc	loc_6F46
		rora
		rorb
		bra	loc_6F54
; ---------------------------------------------------------------------------

loc_6F46:				; Math result Z
		asl	MReg02+1
		rol	MReg02		; Math result Z
		bvc	loc_6F3E
		ror	MReg02		; Math result Z
		ror	MReg02+1	; Math result Z

loc_6F54:
		coma
		sta	>byte_4876
		ldb	MReg02		; Math result Z
		stb	>word_486D
		rts
; End of function sub_6EA2


; =============== S U B	R O U T	I N E =======================================


sub_6F5F:
		ldd	<DPbyte_42
		jsr	Shift_D_L_7
		std	<Stars_XT
		rts
; End of function sub_6F5F


; =============== S U B	R O U T	I N E =======================================


sub_6F67:
		ldd	<DPbyte_42
		jsr	sub_CDA9	; Shift	D register left
		std	<Stars_XT
		rts
; End of function sub_6F67


; =============== S U B	R O U T	I N E =======================================


sub_6F6F:
		ldd	MReg43
		addd	MReg4C
		bvc	loc_6F7D
		inc	<DPbyte_A7
		bvc	loc_6F7D
		dec	<DPbyte_A7

loc_6F7D:
		std	MReg4C
		std	MReg20		; XT2
		ldd	MReg43
		jsr	Shift_D_L_4
		ldb	<DPbyte_7D	; Joystick X
		bpl	loc_6F8E
		comb

loc_6F8E:
		aslb
		mul
		tst	<DPbyte_7D	; Joystick X
		bge	loc_6F98
		coma
		negb
		sbca	#$FF

loc_6F98:
		jsr	Shift_D_R_4
		std	MReg47
		addd	MReg4D
		std	MReg4D
		std	MReg21		; YT2
		ldd	MReg43
		jsr	Shift_D_L_4
		ldb	<DPbyte_7F	; Joystick Y
		bpl	loc_6FB2
		comb

loc_6FB2:
		nop
		mul
		tst	<DPbyte_7F	; Joystick Y
		bpl	loc_6FBC
		coma
		negb
		sbca	#$FF

loc_6FBC:
		jsr	Shift_D_R_4
		std	MReg4B
		addd	MReg4E
		cmpd	#$1C00
		ble	loc_6FD0
		ldd	#$1C00
		bra	loc_6FD9
; ---------------------------------------------------------------------------

loc_6FD0:
		cmpd	#$200
		bge	loc_6FD9
		ldd	#$200

loc_6FD9:
		std	MReg4E
		std	MReg22		; ZT2
		rts
; End of function sub_6F6F


; =============== S U B	R O U T	I N E =======================================


sub_6FE0:
		ldd	MReg4E
		cmpd	#$380
		ble	loc_6FEF
		subd	#$180
		std	MReg4E

loc_6FEF:
		bra	loc_7000
; End of function sub_6FE0


; =============== S U B	R O U T	I N E =======================================


sub_6FF1:
		ldd	MReg4E
		cmpd	#$F300
		ble	loc_7000
		subd	#$100
		std	MReg4E

loc_7000:
		ldd	MReg43
		addd	MReg4C
		std	MReg4C
		ldd	#$300
		subd	MReg43
		jsr	Shift_D_R_3
		addd	MReg43
		std	MReg43
		lda	byte_4B15
		lsra
		bcc	loc_7023	; Towers roll calcs
		ldd	#$BB8
		bra	loc_7026
; ---------------------------------------------------------------------------

loc_7023:				; Towers roll calcs
		ldd	#$F448

loc_7026:				; Sine for rotation
		std	MReg11
		ldd	#$3EEB
		std	MReg12		; Cosine for rotation
		jsr	sub_CE24	; Run math program $00 Roll
		ldd	#0
		subd	<DPbyte_A3
		jsr	sub_6E70	; Towers collision roll	limits
		rts
; End of function sub_6FF1


; =============== S U B	R O U T	I N E =======================================

; Trench viewpoint calc

sub_703B:
		ldd	MReg43
		addd	MReg4C
		std	MReg4C
		std	MReg20		; XT2
		ldd	MReg43
		jsr	Shift_D_L_4
		ldb	<DPbyte_7D	; Joystick X
		bpl	loc_7052
		comb

loc_7052:
		mul
		tst	<DPbyte_7D	; Joystick X
		bge	loc_705B
		coma
		negb
		sbca	#$FF

loc_705B:				; Trench X min/max limits
		jsr	Shift_D_R_4
		std	MReg47
		addd	MReg4D
		cmpd	#$1FF
		ble	loc_706D
		ldd	#$1FF

loc_706D:
		cmpd	#$FE01
		bge	loc_7076
		ldd	#$FE01

loc_7076:
		std	MReg4D
		std	MReg21		; YT2
		ldd	MReg43
		aslb
		rola
		aslb
		rola
		aslb
		rola
		aslb
		rola
		ldb	<DPbyte_7F	; Joystick Y
		bpl	loc_708C
		comb

loc_708C:
		aslb
		mul
		tst	<DPbyte_7F	; Joystick Y
		bpl	loc_7096
		coma
		negb
		sbca	#$FF

loc_7096:
		asra
		rorb
		asra
		rorb
		asra
		rorb
		asra
		rorb
		std	MReg4B
		addd	MReg4E
		cmpd	#$FEFF		; Trench Y top/bottom limits
		ble	loc_70AD
		ldd	#$FEFF

loc_70AD:
		cmpd	#$F201
		bge	loc_70B6
		ldd	#$F201

loc_70B6:
		std	MReg4E
		std	MReg22		; ZT2
		rts
; End of function sub_703B


; =============== S U B	R O U T	I N E =======================================


sub_70BD:
		ldx	#byte_4866
		jsr	sub_70F0
		jsr	sub_7111
		beq	locret_70CB
		jsr	sub_CE2F	; Run math program $0E Pitch

locret_70CB:
		rts
; End of function sub_70BD


; =============== S U B	R O U T	I N E =======================================


sub_70CC:
		ldx	#byte_486F
		jsr	sub_70F0
		jsr	sub_7111
		beq	locret_70DA
		jsr	sub_CE3A	; Run math program $1C Yaw

locret_70DA:
		rts
; End of function sub_70CC


; =============== S U B	R O U T	I N E =======================================


sub_70DB:
		orcc	#$10		; Disable interrupts
		ldd	<DPbyte_6B
		std	<DPbyte_7F	; Joystick Y
		ldd	<DPbyte_74
		std	<DPbyte_7D	; Joystick X
		ldd	<DPbyte_2F
		std	<DPbyte_7B
		ldd	<DPbyte_2D
		std	<DPbyte_79
		andcc	#$EF ; 'Ô'      ; Enable interrupts
		rts
; End of function sub_70DB


; =============== S U B	R O U T	I N E =======================================


sub_70F0:
		lda	7,x
		bpl	loc_70F5
		coma

loc_70F5:
		ldb	#$80 ; 'Ä'
		mul
		nop
		nop
		nop
		ldb	7,x
		bmi	loc_7107
		adda	8,x
		bvc	loc_7105
		lda	#$7F ; ''

loc_7105:
		bra	loc_710E
; ---------------------------------------------------------------------------

loc_7107:
		nega
		adda	8,x
		bvc	loc_710E
		lda	#$81 ; 'Å'

loc_710E:
		sta	8,x
		rts
; End of function sub_70F0


; =============== S U B	R O U T	I N E =======================================


sub_7111:
		lda	8,x
		bpl	loc_7116
		nega

loc_7116:
		cmpa	#$4E ; 'N'
		bcs	loc_713A
		ldd	#$3FC2
		std	MReg12		; Cosine for rotation
		lda	8,x
		bpl	loc_712F
		adda	#$4E ; 'N'
		sta	8,x
		ldd	#$FA70
		std	MReg11		; Sine for rotation
		rts
; ---------------------------------------------------------------------------

loc_712F:
		suba	#$4E ; 'N'
		sta	8,x
		ldd	#$590
		std	MReg11		; Sine for rotation
		rts
; ---------------------------------------------------------------------------

loc_713A:
		cmpa	#$E
		bcs	loc_715E
		ldd	#$3FFE
		std	MReg12		; Cosine for rotation
		lda	8,x
		bpl	loc_7153
		adda	#$E
		sta	8,x
		ldd	#$FF00
		std	MReg11		; Sine for rotation
		rts
; ---------------------------------------------------------------------------

loc_7153:
		suba	#$E
		sta	8,x
		ldd	#$100
		std	MReg11		; Sine for rotation
		rts
; ---------------------------------------------------------------------------

loc_715E:
		clrb
		rts
; End of function sub_7111


; =============== S U B	R O U T	I N E =======================================

; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2

sub_7160:
		lda	>byte_486E
		beq	loc_7181
		jsr	sub_71C4
		lda	>byte_486E
		bpl	loc_7176
		ldd	#0
		subd	MReg11		; Sine for rotation
		std	MReg11		; Sine for rotation

loc_7176:
		clra
		ldb	#5		; Point	BIC to[	A,B,C ][x, y, z] 2
		std	MW1
		lda	#$E		; Pitch	program
		jsr	Math_Run_Start	; Do math program run

loc_7181:
		lda	>byte_4877
		beq	loc_71A2
		jsr	sub_71C4
		lda	>byte_4877
		bpl	loc_7197
		ldd	#0
		subd	MReg11		; Sine for rotation
		std	MReg11		; Sine for rotation

loc_7197:
		clra
		ldb	#5		; Point	BIC to[	A,B,C ][x, y, z] 2
		std	MW1
		lda	#$1C		; Yaw program
		jsr	Math_Run_Start	; Do math program run

loc_71A2:
		lda	>byte_4878
		beq	locret_71C3
		jsr	sub_71C4
		lda	>byte_4878
		bpl	loc_71B8
		ldd	#0
		subd	MReg11		; Sine for rotation
		std	MReg11		; Sine for rotation

loc_71B8:
		clra
		ldb	#5		; Point	BIC to[	A,B,C ][x, y, z] 2
		std	MW1
		lda	#0		; Roll program
		jsr	Math_Run_Start	; Do math program run

locret_71C3:
		rts
; End of function sub_7160


; =============== S U B	R O U T	I N E =======================================


sub_71C4:
		bpl	loc_71C7
		nega

loc_71C7:
		ldb	#3
		mul
		ldx	#(loc_71D9+1)
		abx
		ldd	,x
		std	MReg11		; Sine for rotation
		ldb	2,x
		sex
		addd	#$4000

loc_71D9:				; Cosine for rotation
		std	MReg12
		rts
; End of function sub_71C4

; ---------------------------------------------------------------------------
word_71DD:	fdb $12
		fcb 0
		fdb $25
		fcb 0
		fdb $37
		fcb 0
		fdb $49
		fcb 0
		fdb $5B
		fcb 0
		fdb $6E
		fcb 0
		fdb $80
		fcb 0
		fdb $92
		fcb $FF
		fdb $A5
		fcb $FF
		fdb $B7
		fcb $FF
		fdb $C9
		fcb $FF
		fdb $DB
		fcb $FF
		fdb $EE
		fcb $FE
		fdb $100
		fcb $FE
		fdb $112
		fcb $FE
		fdb $124
		fcb $FD
		fdb $137
		fcb $FD
		fdb $149
		fcb $FD
		fdb $15B
		fcb $FC
		fdb $16E
		fcb $FC
		fdb $180
		fcb $FC
		fdb $192
		fcb $FB
		fdb $1A4
		fcb $FB
		fdb $1B7
		fcb $FA
		fdb $1C9
		fcb $FA
		fdb $1DB
		fcb $F9
		fdb $1ED
		fcb $F9
		fdb $200
		fcb $F8
		fdb $212
		fcb $F7
		fdb $224
		fcb $F7
		fdb $237
		fcb $F6
		fdb $249
		fcb $F6
		fdb $25B
		fcb $F5
		fdb $26D
		fcb $F4
		fdb $280
		fcb $F4
		fdb $292
		fcb $F3
		fdb $2A4
		fcb $F2
		fdb $2B6
		fcb $F1
		fdb $2C9
		fcb $F0
		fdb $2DB
		fcb $F0
		fdb $2ED
		fcb $EF
		fdb $2FF
		fcb $EE
		fdb $312
		fcb $ED
		fdb $324
		fcb $EC
		fdb $336
		fcb $EB
		fdb $348
		fcb $EA
		fdb $35B
		fcb $E9
		fdb $36D
		fcb $E9
		fdb $37F
		fcb $E8
		fdb $391
		fcb $E7
		fdb $3A4
		fcb $E5
		fdb $3B6
		fcb $E4
		fdb $3C8
		fcb $E3
		fdb $3DA
		fcb $E2
		fdb $3ED
		fcb $E1
		fdb $3FF
		fcb $E0
		fdb $411
		fcb $DF
		fdb $423
		fcb $DE
		fdb $436
		fcb $DD
		fdb $448
		fcb $DB
		fdb $45A
		fcb $DA
		fdb $46C
		fcb $D9
		fdb $47F
		fcb $D8
		fdb $491
		fcb $D6
		fdb $4A3
		fcb $D5
		fdb $4B5
		fcb $D4
		fdb $4C8
		fcb $D2
		fdb $4DA
		fcb $D1
		fdb $4EC
		fcb $CF
		fdb $4FE
		fcb $CE
		fdb $510
		fcb $CD
		fdb $523
		fcb $CB
		fdb $535
		fcb $CA
		fdb $547
		fcb $C8
		fdb $559
		fcb $C7
		fdb $56C
		fcb $C5
		fdb $57E
		fcb $C4
		fdb $590
		fcb $C2

; =============== S U B	R O U T	I N E =======================================

; Space	wave

sub_72C7:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_7160	; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2
		jsr	sub_761D	; Display score
		lda	byte_4B2D
		bne	loc_72F0
		ldd	word_4B0E	; Attract screen/game phase  timer
		cmpd	#$A0 ; '†'
		bcc	loc_72F0
		andb	#$10
		bne	loc_72EB
		ldb	#$4C ; 'L'
		bra	loc_72ED
; ---------------------------------------------------------------------------

loc_72EB:				; Shoot	Tie Fighters text index
		ldb	#$4D ; 'M'

loc_72ED:				; Print	text string from pointer table
		jsr	sub_E7C7

loc_72F0:				; Insert vector	instructions for shields
		jsr	sub_95A7
		jsr	sub_7765	; Space	wave sub_7765
		jsr	sub_B6B9	; Insert vector	instructions at	joystick position for laser explosion 2
		jsr	sub_CD80	; Starfield
		jsr	sub_BA12	; Process tie/tower/bunker explosions
		jsr	sub_AE60
		jsr	sub_786A	; Process tie fighters and insert vectors
		jsr	sub_AAE4	; Fireball processing
		jsr	sub_B32B
		jsr	sub_AEBD
		jsr	sub_98B0	; Insert vector	laser explosion	small circle
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_72C7


; =============== S U B	R O U T	I N E =======================================


sub_7315:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_7160	; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2
		jsr	sub_761D	; Display score
		jsr	sub_95A7	; Insert vector	instructions for shields
		jsr	sub_CD80	; Starfield
		jsr	sub_BA12	; Process tie/tower/bunker explosions
		jsr	sub_786A	; Process tie fighters and insert vectors
		jsr	sub_AAE4	; Fireball processing
		jsr	sub_7707	; Game Over text handling
		jsr	sub_98B0	; Insert vector	laser explosion	small circle
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_7315


; =============== S U B	R O U T	I N E =======================================

; End of space wave? Also Trench catwalks

sub_733C:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_7160	; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2
		jsr	sub_761D	; Display score
		jsr	sub_95A7	; Insert vector	instructions for shields
		jsr	sub_B6B9	; Insert vector	instructions at	joystick position for laser explosion 2
		jsr	sub_CD80	; Starfield
		jsr	sub_7765	; Space	wave sub_7765
		jsr	sub_BA12	; Process tie/tower/bunker explosions
		jsr	sub_AE60
		jsr	sub_786A	; Process tie fighters and insert vectors
		jsr	sub_AAE4	; Fireball processing
		jsr	sub_B32B
		jsr	sub_AEBD
		jsr	sub_98B0	; Insert vector	laser explosion	small circle
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_733C


; =============== S U B	R O U T	I N E =======================================


sub_736F:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_7160	; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2
		jsr	sub_761D	; Display score
		jsr	sub_95A7	; Insert vector	instructions for shields
		jsr	sub_B6B9	; Insert vector	instructions at	joystick position for laser explosion 2
		jsr	sub_CD80	; Starfield
		jsr	sub_77A4
		jsr	sub_98B0	; Insert vector	laser explosion	small circle
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_736F


; =============== S U B	R O U T	I N E =======================================

; Towers/Bunkers wave

sub_7390:
		jsr	sub_6112	; Towers/Bunkers wave
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_7160	; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2
		jsr	sub_761D	; Display score
		jsr	sub_768D	; Display tower	count and hit score
		jsr	sub_95A7	; Insert vector	instructions for shields
		jsr	sub_B6B9	; Insert vector	instructions at	joystick position for laser explosion 2
		jsr	sub_CD8C	; Towers surface dots
		jsr	sub_AE60
		jsr	sub_AAE4	; Fireball processing
		jsr	sub_A214
		jsr	sub_B2D2
		jsr	sub_AEBD
		jsr	sub_BA12	; Process tie/tower/bunker explosions
		jsr	sub_98B0	; Insert vector	laser explosion	small circle
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_7390


; =============== S U B	R O U T	I N E =======================================

; Towers

sub_73C3:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_7160	; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2
		jsr	sub_761D	; Display score
		jsr	sub_768D	; Display tower	count and hit score
		jsr	sub_95A7	; Insert vector	instructions for shields
		jsr	sub_CD8C	; Towers surface dots
		jsr	sub_AAE4	; Fireball processing
		jsr	sub_A214
		jsr	sub_7707	; Game Over text handling
		jsr	sub_98B0	; Insert vector	laser explosion	small circle
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_73C3


; =============== S U B	R O U T	I N E =======================================

; Towers

sub_73EA:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_7160	; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2
		jsr	sub_761D	; Display score
		jsr	sub_76D3	; Towers left to shoot count
		ldb	#$4F ; 'O'
		jsr	sub_E7C7	; Print	text string from pointer table
		jsr	sub_95A7	; Insert vector	instructions for shields
		jsr	sub_B6B9	; Insert vector	instructions at	joystick position for laser explosion 2
		jsr	sub_CD8C	; Towers surface dots
		jsr	sub_BA12	; Process tie/tower/bunker explosions
		jsr	sub_98B0	; Insert vector	laser explosion	small circle
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_73EA


; =============== S U B	R O U T	I N E =======================================


sub_7413:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_7160	; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2
		jsr	sub_761D	; Display score
		jsr	sub_76D3	; Towers left to shoot count
		ldb	#$4F ; 'O'
		jsr	sub_E7C7	; Print	text string from pointer table
		jsr	sub_95A7	; Insert vector	instructions for shields
		jsr	sub_B6B9	; Insert vector	instructions at	joystick position for laser explosion 2
		jsr	sub_859B
		jsr	sub_BA12	; Process tie/tower/bunker explosions
		jsr	sub_98B0	; Insert vector	laser explosion	small circle
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_7413


; =============== S U B	R O U T	I N E =======================================


sub_743C:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_7160	; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2
		jsr	sub_761D	; Display score
		lda	word_4B0E	; Attract screen/game phase  timer
		cmpa	#4
		bhi	loc_7464
		lda	<DPbyte_98
		bne	loc_745A
		jsr	sub_76D3	; Towers left to shoot count
		bra	loc_7464
; ---------------------------------------------------------------------------

loc_745A:
		ldd	#$7100
		std	,y++
		ldb	#$46 ; 'F'
		jsr	sub_E7C7	; Print	text string from pointer table

loc_7464:
		lda	byte_4B2D
		bne	loc_7491
		lda	word_4B0E	; Attract screen/game phase  timer
		cmpa	#8
		bhi	loc_7491
		lda	<DPbyte_98
		bne	loc_7491
		lda	byte_4B35
		bne	loc_7491
		lda	byte_4B12
		bne	loc_7482
		ldb	#$4C ; 'L'
		bra	loc_748E
; ---------------------------------------------------------------------------

loc_7482:				; Game over/insert coins timer
		lda	<DPbyte_43
		anda	#$10
		bne	loc_748C
		ldb	#$4C ; 'L'
		bra	loc_748E
; ---------------------------------------------------------------------------

loc_748C:
		ldb	#$4E ; 'N'

loc_748E:				; Print	text string from pointer table
		jsr	sub_E7C7

loc_7491:
		lda	byte_4B2D
		bne	loc_74A5
		lda	>word_4895
		beq	loc_74A5
		ldd	#$7100
		std	,y++
		ldb	#$44 ; 'D'
		jsr	sub_E7C7	; Print	text string from pointer table

loc_74A5:
		lda	byte_4B36
		blt	loc_74B6
		bne	loc_74B3
		ldb	#$4F ; 'O'
		jsr	sub_E7C7	; Print	text string from pointer table
		bra	loc_74B6
; ---------------------------------------------------------------------------

loc_74B3:
		jsr	sub_97C2

loc_74B6:				; Insert vector	instructions for shields
		jsr	sub_95A7
		jsr	sub_B6B9	; Insert vector	instructions at	joystick position for laser explosion 2
		jsr	sub_859B
		jsr	sub_AE60
		jsr	sub_AAE4	; Fireball processing
		jsr	sub_B071
		jsr	sub_AEBD
		jsr	sub_ADAF
		jsr	sub_98B0	; Insert vector	laser explosion	small circle
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_743C


; =============== S U B	R O U T	I N E =======================================

; Game over

sub_74D5:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_7160	; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2
		jsr	sub_761D	; Display score
		lda	byte_4B3E
		beq	loc_74F2
		ldd	#$7100
		std	,y++
		ldb	#$46 ; 'F'
		jsr	sub_E7C7	; Print	text string from pointer table

loc_74F2:				; Insert vector	instructions for shields
		jsr	sub_95A7
		jsr	sub_859B
		jsr	sub_AAE4	; Fireball processing
		lda	byte_4B2D
		bne	loc_750F
		lda	>word_4895
		beq	loc_750F
		ldd	#$7100
		std	,y++
		ldb	#$44 ; 'D'
		jsr	sub_E7C7	; Print	text string from pointer table

loc_750F:				; Game Over text handling
		jsr	sub_7707
		jsr	sub_98B0	; Insert vector	laser explosion	small circle
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_74D5


; =============== S U B	R O U T	I N E =======================================


sub_7519:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_7160	; Update Roll, Pitch and Yaw for [A, B,	C][x, y, z] 2
		jsr	sub_761D	; Display score
		jsr	sub_95A7	; Insert vector	instructions for shields
		jsr	sub_B6B9	; Insert vector	instructions at	joystick position for laser explosion 2
		jsr	sub_CD80	; Starfield
		ldb	#$45 ; 'E'
		jsr	sub_E7C7	; Print	text string from pointer table
		lda	word_4B0E	; Attract screen/game phase  timer
		cmpa	#2
		bgt	loc_755A
		ldb	#$47 ; 'G'
		jsr	sub_E7C7	; Print	text string from pointer table
		ldb	#$48 ; 'H'
		jsr	sub_E7C7	; Print	text string from pointer table
		ldd	#$90 ; 'ê'
		std	,y++
		ldd	#$70 ; 'p'
		std	,y++
		lda	<DPbyte_8E
		jsr	loc_E7AD
		ldd	#$8040
		std	,y++

loc_755A:				; Attract screen/game phase  timer
		lda	word_4B0E
		cmpa	#1
		bgt	loc_759C
		lda	word_4845
		beq	loc_759C
		lda	byte_4592
		anda	#3
		beq	loc_759C
		ldb	byte_4593
		andb	#3
		addb	#6
		cmpb	<DPbyte_60	; Shield count
		bhi	loc_757C
		ldb	#$4A ; 'J'
		bra	loc_7599
; ---------------------------------------------------------------------------

loc_757C:
		ldu	#$A01A
		stu	,y++
		ldu	#$48 ; 'H'
		stu	,y++
		ldu	#$1EC0
		stu	,y++
		ldb	#1
		stb	<DPbyte_AD
		jsr	loc_E7AD
		ldd	#$8040
		std	,y++
		ldb	#$49 ; 'I'

loc_7599:				; Print	text string from pointer table
		jsr	sub_E7C7

loc_759C:				; Attract screen/game phase  timer
		lda	word_4B0E
		cmpa	#0
		bgt	loc_75B2
		lda	byte_4B2D
		bne	loc_75B2
		ldb	byte_4B15
		beq	loc_75B2
		ldb	#$4B ; 'K'
		jsr	sub_E7C7	; Print	text string from pointer table

loc_75B2:				; Insert vector	laser explosion	small circle
		jsr	sub_98B0
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_7519


; =============== S U B	R O U T	I N E =======================================


sub_75B9:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_761D	; Display score
		lda	byte_4B36
		ble	loc_75CC
		jsr	sub_97C2

loc_75CC:				; Insert vector	instructions for shields
		jsr	sub_95A7
		jsr	sub_B6B9	; Insert vector	instructions at	joystick position for laser explosion 2
		jsr	sub_77A4
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_75B9


; =============== S U B	R O U T	I N E =======================================

; Space	wave

sub_75D9:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		lda	#$10		; BIC points to	Matrix 4
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		jsr	sub_761D	; Display score
		jsr	sub_95A7	; Insert vector	instructions for shields
		jsr	sub_B6B9	; Insert vector	instructions at	joystick position for laser explosion 2
		ldd	#$1F98
		std	,y++
		ldd	#0
		std	,y++
		ldd	#$7200
		std	,y++
		ldd	#$BE50
		std	,y++
		ldd	#$7200
		std	,y++
		jsr	sub_BB85	; Death	Star explosion animation
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_75D9


; =============== S U B	R O U T	I N E =======================================

; Death	Star explosion

sub_760A:
		jsr	sub_6112	; Insert vector	data for four blue dots	in screen corners
		jsr	sub_761D	; Display score
		jsr	sub_95A7	; Insert vector	instructions for shields
		jsr	sub_B6B9	; Insert vector	instructions at	joystick position for laser explosion 2
		jsr	sub_BB85	; Death	Star explosion animation
		jsr	sub_612F	; Vector instructions end
		rts
; End of function sub_760A


; =============== S U B	R O U T	I N E =======================================

; Display score

sub_761D:
		ldd	#$B9F2
		std	,y++
		ldd	#$6280
		std	,y++
		ldd	#$1E0
		std	,y++
		ldd	#$1E20
		std	,y++
		lda	#6
		sta	<DPbyte_AD
		ldx	#$485C
		jsr	sub_E764
		ldd	#$8040
		std	,y++
		ldb	byte_4B2C
		beq	loc_766E
		subb	#8
		cmpb	#$20 ; ' '
		bcc	loc_764D
		ldb	#0

loc_764D:
		stb	byte_4B2C
		lsrb
		lda	#$66 ; 'f'
		std	,y++
		ldd	#$1B0
		std	,y++
		ldd	#$1E50
		std	,y++
		lda	#5
		sta	<DPbyte_AD
		ldx	#$4B28
		jsr	sub_E772	; Display BCD number text
		ldd	#$8040
		std	,y++

loc_766E:
		ldd	#$6280
		std	,y++
		ldd	#$210
		std	,y++
		ldd	#$138
		std	,y++
		lda	#1
		sta	<DPbyte_AD
		lda	byte_4B16
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	#$8040
		std	,y++
		rts
; End of function sub_761D


; =============== S U B	R O U T	I N E =======================================

; Display tower	count and hit score

sub_768D:
		lda	byte_4B13	; Display tower	hit score
		ble	loc_76FC
		lda	byte_4B1A
		beq	sub_76D3	; Towers left to shoot count
		lda	<DPbyte_43	; Game over/insert coins timer
		anda	#$30 ; '0'
		beq	loc_76CE
		ldb	#$40 ; '@'
		jsr	sub_E7C7	; Print	text string from pointer table
		ldd	#$6280		; Vector STAT 2,80 instruction
		std	,y++
		ldd	#$180		; Vector draw to position
		std	,y++
		ldd	#$1ED0
		std	,y++
		lda	#4
		sta	<DPbyte_AD
		lda	byte_4B2E	; Temporary score adder	towers 1
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	byte_4B2F	; Temporary score adder	towers 2
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	byte_4B30	; Temporary score adder	towers 3
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	#$8040		; Vector CNTR instruction
		std	,y++
		bra	sub_76D3	; Towers left to shoot count
; ---------------------------------------------------------------------------

loc_76CE:
		ldb	#$43 ; 'C'
		jsr	sub_E7C7	; Print	text string from pointer table
; End of function sub_768D


; =============== S U B	R O U T	I N E =======================================

; Towers left to shoot count

sub_76D3:
		lda	byte_4B13	; Display towers left to shoot count
		ble	loc_76FC
		ldd	#$41 ; 'A'
		jsr	sub_E7C7	; Print	text string from pointer table
		ldd	#$6280		; Vector STAT 2,80 instruction
		std	,y++
		ldd	#$198
		std	,y++
		ldd	#$168
		std	,y++
		lda	#1
		sta	<DPbyte_AD
		lda	byte_4B1A
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	#$8040		; Vector CNTR instruction
		std	,y++

loc_76FC:
		lda	byte_4B35
		beq	locret_7706
		ldb	#$42 ; 'B'
		jsr	sub_E7C7	; Print	text string from pointer table

locret_7706:
		rts
; End of function sub_76D3


; =============== S U B	R O U T	I N E =======================================

; Game Over text handling

sub_7707:
		lda	word_4B0E+1	; Attract screen/game phase  timer
		cmpa	#$20 ; ' '
		bls	loc_7710
		lda	#$20 ; ' '

loc_7710:
		ldb	#6
		mul
		negb
		addb	#$C0 ; '¿'
		lda	#$70 ; 'p'
		std	,y++
		ldb	#4
		jsr	sub_E7C7	; Print	text string from pointer table
		rts
; End of function sub_7707


; =============== S U B	R O U T	I N E =======================================


sub_7720:
		std	word_4AD6+1
		ldd	#0
		std	word_4AD4
		sta	word_4AD6

loc_772C:
		asl	>byte_4AD8
		rol	word_4AD6+1
		lda	word_4AD6
		adca	word_4AD6
		daa
		sta	word_4AD6
		lda	word_4AD4+1
		adca	word_4AD4+1
		daa
		sta	word_4AD4+1
		rol	word_4AD4
		leax	-1,x
		bne	loc_772C
		rts
; End of function sub_7720


; =============== S U B	R O U T	I N E =======================================


sub_774E:
		sta	word_4AD6+1
		anda	#$F0 ; ''
		ldb	#$A0 ; '†'
		mul
		ldb	word_4AD6+1
		andb	#$F
		stb	word_4AD6+1
		adda	word_4AD6+1
		sta	word_4AD6+1
		rts
; End of function sub_774E


; =============== S U B	R O U T	I N E =======================================

; Space	wave sub_7765

sub_7765:
		ldd	MReg14		; Ax2
		ble	locret_77A3
		std	DVSRH
		ldd	MReg15		; Ay2
		std	MReg01		; Math result Y
		tsta
		bpl	loc_777A
		coma
		negb
		sbca	#$FF

loc_777A:				; Ax2
		subd	MReg14
		bge	locret_77A3
		ldd	MReg16		; Az2
		std	MReg02		; Math result Z
		tsta
		bpl	loc_778C
		coma
		negb
		sbca	#$FF

loc_778C:				; Ax2
		subd	MReg14

loc_778F:
		bge	locret_77A3
		jsr	sub_CCF0	; Get divider result and multiply by Math result Z, insert VCTR	instruction
		ldd	#$7300
		std	,y++
		ldd	#$BE50		; Vector JRSL Small Death Star
		std	,y++
		ldd	#$7200
		std	,y++

locret_77A3:
		rts
; End of function sub_7765


; =============== S U B	R O U T	I N E =======================================


sub_77A4:
		ldd	MReg14		; Ax2
		ble	locret_77D3
		std	DVSRH
		ldd	MReg15		; Ay2
		std	MReg01		; Math result Y
		tsta
		bpl	loc_77B9
		coma
		negb
		sbca	#$FF

loc_77B9:				; Ax2
		subd	MReg14
		bge	locret_77D3
		ldd	MReg16		; Az2
		std	MReg02		; Math result Z
		tsta
		bpl	loc_77CB
		coma
		negb
		sbca	#$FF

loc_77CB:				; Ax2
		subd	MReg14
		bge	locret_77D3
		jsr	sub_77D4

locret_77D3:
		rts
; End of function sub_77A4


; =============== S U B	R O U T	I N E =======================================


sub_77D4:
		jsr	sub_CCF0	; Get divider result and multiply by Math result Z, insert VCTR	instruction
		ldd	-4,y
		std	<DPbyte_5	; Zoom value
		ldd	-2,y
		std	<DPbyte_3
		ldd	<DPbyte_56	; Zoom value
		std	<DPbyte_1
		ldu	#$BD68
		jsr	sub_7863
		ldu	#$BDA6
		jsr	sub_785B
		ldu	#$BDB2
		jsr	sub_785B
		ldu	#$BDDA
		jsr	sub_785B
		ldu	#$BE06
		jsr	sub_785B
		ldd	<DPbyte_56	; Zoom value
		suba	#3
		cmpd	#$7000
		bcc	loc_780E
		ldd	#$7000

loc_780E:
		std	<DPbyte_1
		cmpa	#$70 ; 'p'
		bne	loc_7819
		ldd	#$6660
		bra	loc_781C
; ---------------------------------------------------------------------------

loc_7819:
		ldd	#$6630

loc_781C:
		std	,y++
		lda	byte_4B14
		bita	#1
		bne	loc_782A
		ldu	#$B728
		bra	loc_7839
; ---------------------------------------------------------------------------

loc_782A:
		ldu	#$B73C
		jsr	sub_785B
		ldu	#$B749
		jsr	sub_785B
		ldu	#$B754

loc_7839:
		jsr	sub_785B
		lda	byte_4B14
		bita	#1
		bne	loc_7848
		ldu	#$B75E
		bra	loc_7857
; ---------------------------------------------------------------------------

loc_7848:
		ldu	#$B770
		jsr	sub_785B
		ldu	#$B77C
		jsr	sub_785B
		ldu	#$B788

loc_7857:
		jsr	sub_785B
		rts
; End of function sub_77D4


; =============== S U B	R O U T	I N E =======================================


sub_785B:
		ldd	<DPbyte_5
		std	,y++
		ldd	<DPbyte_3
		std	,y++
; End of function sub_785B


; =============== S U B	R O U T	I N E =======================================


sub_7863:
		ldd	<DPbyte_1
		std	,y++
		stu	,y++
		rts
; End of function sub_7863


; =============== S U B	R O U T	I N E =======================================

; Process tie fighters and insert vectors

sub_786A:
		ldx	#byte_4900	; 3x Tie fighter data structure	($19 bytes per Tie)

loc_786D:				; Pointer to Tie fighter data
		stx	<DPbyte_64
		lda	3,x
		beq	loc_7876
		jsr	sub_7881

loc_7876:				; Pointer to Tie fighter data
		ldx	<DPbyte_64
		leax	$19,x
		cmpx	#byte_4900+$4B	; 3x Tie fighter data structure	($19 bytes per Tie)
		bcs	loc_786D

locret_7880:
		rts
; End of function sub_786A


; =============== S U B	R O U T	I N E =======================================


sub_7881:
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		clra
		ldb	2,x
		addb	#3
		std	MW1
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		lda	MReg00		; Math result X
		asla
		bvs	loc_7909
		lda	MReg01		; Math result Y
		asla
		bvs	loc_7909
		lda	MReg02		; Math result Z
		asla
		bvs	loc_7909
		ldd	MReg38
		addd	MReg39
		addd	MReg3A
		tfr	d, u
		cmpu	#$900
		bhi	loc_78BB
		ldd	$15,x
		ora	#$20 ; ' '
		std	$15,x

loc_78BB:
		cmpu	#$100
		bhi	loc_78C9
		ldd	$15,x
		ora	#4
		std	$15,x

loc_78C9:
		cmpu	#$A0 ; '†'
		bhi	loc_78FF
		lda	word_4B38
		bne	loc_78E4
		lda	2,x
		sta	word_4B38
		jsr	Sound_4
		jsr	Sound_2A
		stu	word_4B38+1
		bra	loc_78FD
; ---------------------------------------------------------------------------

loc_78E4:
		cmpa	2,x
		bne	loc_78FD
		cmpu	word_4B38+1
		bgt	loc_78F3
		stu	word_4B38+1
		bra	loc_78FD
; ---------------------------------------------------------------------------

loc_78F3:
		bcs	loc_78FD
		lda	#$FF
		sta	word_4B38+1
		jsr	Sound_2E

loc_78FD:
		bra	loc_7909
; ---------------------------------------------------------------------------

loc_78FF:
		lda	2,x
		cmpa	word_4B38
		bne	loc_7909
		clr	word_4B38

loc_7909:				; Math result X
		ldd	MReg00
		cmpd	#$10
		lble	locret_7880
		cmpd	#$7F00
		lbhi	locret_7880
		std	DVSRH
		std	MReg0C		; XT
		ldd	MReg01		; Math result Y
		std	MReg0D		; YT
		ldd	MReg39
		subd	MReg38
		lbcc	locret_7880
		ldd	MReg02		; Math result Z
		std	MReg0E		; ZT
		ldd	MReg3A
		subd	MReg38
		lbcc	locret_7880
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		ldd	$15,x
		ora	#$10
		std	$15,x
		lda	word_4B3B
		bne	loc_7972
		lda	4,x
		cmpa	#4
		bne	loc_7972
		inc	word_4B3B
		lda	byte_4B14
		lsra
		bcs	loc_796F
		lda	PRNG
		bpl	loc_796A
		jsr	Sound_15
		bra	loc_796D
; ---------------------------------------------------------------------------

loc_796A:
		jsr	Sound_B

loc_796D:
		bra	loc_7972
; ---------------------------------------------------------------------------

loc_796F:
		jsr	Sound_8

loc_7972:
		lda	2,x
		jsr	sub_CE18	; Run math program $80 Copy [BIC] to Matrix 3
		jsr	sub_CCF0	; Get divider result and multiply by Math result Z, insert VCTR	instruction
		ldd	#$50 ; 'P'
		std	MReg01		; Math result Y
		lda	#$86 ; 'Ü'      ; Reg01 = Reg01 x Reg00
					; Reg02	= Reg02	x Reg00
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg01		; Math result Y
		addd	#$A
		std	<DPbyte_1
		ldd	<DPbyte_D6
		subd	<DPbyte_B3
		bpl	loc_7997
		coma
		negb
		sbca	#$FF

loc_7997:
		std	<DPbyte_5
		std	<DPbyte_3
		ldd	<DPbyte_D8
		subd	<DPbyte_B5
		bpl	loc_79A5
		coma
		negb
		sbca	#$FF

loc_79A5:
		std	<DPbyte_7
		addd	<DPbyte_3
		std	<DPbyte_3
		ldd	<DPbyte_5
		subd	<DPbyte_1
		bgt	loc_79CF
		ldd	<DPbyte_7
		subd	<DPbyte_1
		bgt	loc_79CF
		ldd	<DPbyte_1
		lsra
		rorb
		addd	<DPbyte_1
		subd	<DPbyte_3
		blt	loc_79CF
		ldd	MReg0C		; XT
		cmpd	<DPbyte_C4
		bcc	loc_79CF
		std	<DPbyte_C4
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		stx	<DPbyte_C2

loc_79CF:
		ldd	<DPbyte_1
		addd	<DPbyte_1
		addd	<DPbyte_1
		subd	<DPbyte_3
		bcs	loc_79E9
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		lda	3,x
		cmpa	#1
		bne	loc_79E9
		ldd	$15,x
		ora	#8
		std	$15,x

loc_79E9:				; Pointer to Tie fighter data
		ldx	<DPbyte_64
		ldb	6,x
		ldu	#word_7A08	; Tie fighter colour table
		aslb
		ldd	b,u
		std	,y++
		lda	#$40 ; '@'      ; Matrix 1 = Matrix 2 x Matrix 3
		jsr	Math_Run_Start	; Do math program run
		ldb	4,x
		jsr	sub_CD14	; Math program 0x50. Matrix Multiply - Transposed
					; Then do perspective division?
		jsr	sub_CD2C	; Format vectors for ties, and tower/bunker explosions
		ldd	#$8040		; Insert vector	CNTR instruction
		std	,y++
		rts
; End of function sub_7881

; ---------------------------------------------------------------------------
word_7A08:	fdb $6280		; Tie fighter colour table
		fdb $6730
		fdb $6280
		fdb $6730
		fdb $6280
		fdb $6740
		fdb $6280
		fdb $6740
		fdb $6280
		fdb $6750
		fdb $6280
		fdb $6750
		fdb $6280
		fdb $6760
		fdb $6280
		fdb $6760
		fdb $6280
		fdb $6770
		fdb $6280
		fdb $6770
		fdb $6280
		fdb $6780
		fdb $6280
		fdb $6780
		fdb $6280
		fdb $6780
		fdb $6280
		fdb $6780
		fdb $6280
		fdb $6780
		fdb $67C0
		fdb $67C0

; =============== S U B	R O U T	I N E =======================================


sub_7A48:
		ldu	#MReg48
		jsr	sub_CDC3	; Initialise math registers matrix
		ldd	#0
		std	MReg4C
		std	MReg4D
		std	MReg4E

loc_7A5A:
		ldd	#0
		sta	<DPbyte_62	; Timer	for fireball hit?
		sta	<DPbyte_63
		sta	<DPbyte_31
		sta	<DPbyte_BC
		sta	<DPbyte_B7
		sta	<DPbyte_BD
		std	<DPbyte_A3
		sta	>byte_4878
		sta	>byte_486E
		sta	>byte_4877
		std	>word_4874
		std	>word_486B
		rts
; End of function sub_7A48

; ---------------------------------------------------------------------------
		fcb $F7, $9D, 2, $BB, $5A, $30,	$5F, $EE
		fcb $D,	$A8, $FF, $FF, $FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF
aCopyright1983At_1:fcc "COPYRIGHT 1983 ATARI"
		fcb $B8, $AD, $BA, $B8,	$DF, $AD, $B6, $A9
		fcb $BA, $AD, $BE, $DF,	$BB, $B6, $BB, $DF
		fcb $B6, $AB
off_7B1E:	fdb byte_7E08, byte_82DC, byte_8286, byte_82DC,	byte_7D42, byte_82DC, byte_81E2, byte_82DC
		fdb byte_81C3, byte_82DC, byte_8267, byte_82DC,	byte_8201, byte_82DC, byte_81E2, byte_82FA
off_7B3E:	fdb byte_7E08, byte_82DC, byte_7D42, byte_82C8,	byte_7DB1, byte_82C8, byte_80C6, byte_82DC
		fdb byte_7F78, byte_82DC, byte_7F97, byte_82DC,	byte_81C3, byte_82D2, byte_7DB1, byte_82FA
off_7B5E:	fdb byte_7E08, byte_82DC, byte_7CF8, byte_82C8,	byte_7DCA, byte_82DC, byte_8066, byte_82E6
		fdb byte_804D, byte_82BE, byte_80C6, byte_82C8,	byte_7E3D, byte_82D2, byte_8267, byte_8325
off_7B7E:	fdb byte_7E08, byte_82DC, byte_7D5B, byte_82C8,	byte_7ED8, byte_82F0, byte_7E75, byte_82D2
		fdb byte_8135, byte_82D2, byte_8226, byte_82C8,	byte_7ED8, byte_82F0, byte_7E75, byte_8325
off_7B9E:	fdb byte_7E08, byte_82DC, byte_8226, byte_82C8,	byte_810A, byte_82D2, byte_804D, byte_82BE
		fdb byte_8066, byte_82E6, byte_7E3D, byte_82D2,	byte_7E21, byte_82D2, byte_7CD6, byte_8325
off_7BBE:	fdb byte_7E08, byte_82DC, byte_7D5B, byte_82C8,	byte_810A, byte_82D2, byte_7FB9, byte_82C8
		fdb byte_8135, byte_82D2, byte_7E75, byte_82D2,	byte_80C6, byte_82C8, byte_7ED8, byte_8325
off_7BDE:	fdb byte_7E08, byte_82DC, byte_8025, byte_82F0,	byte_7DE3, byte_82E6, byte_7F16, byte_82C8
		fdb byte_7FB9, byte_82C8, byte_80EE, byte_82BE,	byte_8242, byte_82C8, byte_7E56, byte_807F
off_7BFE:	fdb byte_7E08, byte_82DC, byte_7D11, byte_82D2,	byte_81A1, byte_82E6, byte_7D80, byte_82E6
		fdb byte_8003, byte_82D2, byte_7EB9, byte_82D2,	byte_7F47, byte_82D2, byte_7EF1, byte_807F
off_7C1E:	fdb byte_7E08, byte_82DC, byte_7E9D, byte_82F0,	byte_7FD2, byte_82F0, byte_809B, byte_82F0
		fdb byte_8176, byte_82E6, byte_82A5, byte_82F0,	byte_81A1, byte_82F0, byte_8201, byte_807F
off_7C3E:	fdb byte_7E08, byte_82DC, byte_7D5B, byte_82C8,	byte_7ED8, byte_82F0, byte_7FD2, byte_82F0
		fdb byte_82A5, byte_82F0, byte_7D80, byte_82E6,	byte_81A1, byte_82F0, byte_8176, byte_807F
off_7C5E:	fdb byte_7E08, byte_82DC, byte_7E9D, byte_82F0,	byte_7FD2, byte_82F0, byte_8154, byte_82C8
		fdb byte_7EB9, byte_82D2, byte_7F47, byte_82D2,	byte_7EF1, byte_82BE, byte_7D80, byte_807F
off_7C7E:	fdb byte_7E08, byte_82DC, off_7C9E, byte_82D2, off_7C9E, byte_82F0, off_7C9E, byte_82D2
		fdb off_7C9E, byte_82F0, off_7C9E, byte_82D2, off_7C9E,	byte_82F0, off_7C9E, byte_807F
off_7C9E:	fdb byte_7D11, byte_7D80, byte_7DE3, byte_7E9D,	byte_7E75, byte_7EB9, byte_7EF1, byte_7F47
		fdb byte_7FD2, byte_8003, byte_8025, byte_809B,	byte_80EE, byte_8154, byte_8176, byte_81A1
		fdb byte_82A5
off_7CC0:	fdb off_7B1E, off_7B3E,	off_7B5E, off_7B7E, off_7B9E, off_7BBE,	off_7BDE, off_7BFE
		fdb off_7C1E, off_7C3E,	off_7C5E
byte_7CD6:	fcb 1, 8, 8, 2,	0, 3, 2, $20
		fcb $20, 1, 3, $30, 1, 2, 2, 2
		fcb $80, $8C, 2, $38, 8, 1, 0, 0
		fcb 1, $E, $C2,	1, $C0,	0, 2, $80
		fcb $80, 5
byte_7CF8:	fcb 2, 0, 0, 2,	$38, 8,	2, 3
		fcb 3, 2, $80, $B0, 2, $C, $C, 2
		fcb $C2, $C2, 2, 0, 0, 2, 8, 8
		fcb 5
byte_7D11:	fcb 1, 0, 0, 1,	$A0, $A0, 1, 3
		fcb 3, 1, $A, $A, 1, 0,	0, 1
		fcb $38, $38, 1, $20, $20, 1, $C0, $C0
		fcb 1, 0, 0, 1,	0, 0, 1, $E
		fcb $E,	1, 8, 8, 1, 0, 0, 1
		fcb 8, 8, 1, $20, $20, 1, $80, $80
		fcb 5
byte_7D42:	fcb 2, 0, $30, 2, $C, 0, 2, 0
		fcb 3, 2, $C0, 0, 2, 0,	$C0, 2
		fcb 3, 0, 2, 0,	$C, 2, $30, 0
		fcb 5
byte_7D5B:	fcb 1, 0, 0, 2,	$A0, $A0, 1, 0
		fcb 0, 1, 3, 3,	2, $A, $A, 1
		fcb 0, 0, 1, $C0, $C0, 2, $A0, $A0
		fcb 1, 3, 3, 1,	0, 0, 2, $3A
		fcb $3A, 1, 0, 0, 5
byte_7D80:	fcb 1, $A, $A, 1, 0, 0,	1, $A0
		fcb $A0, 1, 0, 0, 1, $A, $A, 1
		fcb 0, 0, 1, $A0, $A0, 1, 0, 0
		fcb 1, $A
byte_7D9A:	fcb $A,	1, 0, 0, 1, $A0, $A0, 1
		fcb 0, 0, 1, $A, $A, 1,	0, 0
		fcb 1, $A0, $A0, 1, 0, 0, 5
byte_7DB1:	fcb 2, $80, $80, 2, $8C, $83, 2, $B0
		fcb $80, 2, $80, $B0, 2, 2, 2, 2
		fcb $32, $E, 2,	$E, $C2, 2, 2, 2
		fcb 5
byte_7DCA:	fcb 2, 2, 2, 2,	$32, $32, 2, 2
		fcb 2, 2, $C8, $C8, 2, 8, 8, 2
		fcb 8, 8, 2, $E0, $E0, 2, $20, $20
		fcb 5
byte_7DE3:	fcb 1, $22, $88, 1, 0, 0, 1, $88
		fcb $22, 1, $33, $CC, 1, $A0, $A, 1
		fcb 0, 0, 1, $A, $A0, 1, $C0, 3
		fcb 2, $28, $82, 2, 0, 0, 2, $88
		fcb $28, 2, 0, 0, 5
byte_7E08:	fcb 2, $41, $41, 2, $41, $41, 2, $14
		fcb $14, 2, $14, $14, 2, $41, $41, 2
		fcb $41, $41, 1, $3C, $3C, 1, $C3, $C3
		fcb 5
byte_7E21:	fcb 2, $80, $80, 2, 0, 0, 2, 8
		fcb 8, 1, 0, 0,	2, $E0,	$E0, 2
		fcb 3, 3, 2, $E, $E, 2,	$B0, $B0
		fcb 1, 0, 0, 5
byte_7E3D:	fcb 2, 0, 0, 2,	$A, $A,	2, $30
		fcb $30, 2, 0, 0, 2, $2B, $2B, 2
		fcb 0, 0, 2, $C0, $C0, 2, $AC, $AC
		fcb 5
byte_7E56:	fcb 2, 3, 3, 2,	2, 0, 1, $C0
		fcb 2, 2, 2, $30, 1, $30, 2, 2
		fcb 2, $C, 1, $C, 2, 2,	2, $C0
		fcb 1, 0, 2, 2,	0, 0, 5
byte_7E75:	fcb 1, 2, 2, 1,	0, 0, 1, 2
		fcb 2, 1, 0, 0,	1, 0, 0, 2
		fcb $F2, $F2, 1, $C, $C, 1, 2, 2
		fcb 1, 0, 0, 1,	$A8, $A8, 2, 0
		fcb 0, 2, 3, 3,	1, 0, 0, 5
byte_7E9D:	fcb 2, $2A, $AA, 1, 0, 0, 2, $AA
		fcb $A8, 2, 0, 3, 2, 0,	$C, 2
		fcb 0, 3
byte_7EAF:	fcb 2, $AA, $A8, 1, 0, 0, 2, $2A
		fcb $AA, 5
byte_7EB9:	fcb 2, $C, $C, 2, 3, 3,	2, $A0
		fcb $A0, 1, 3, 3, 1, $A, $A, 1
		fcb $28, $28, 1, $A, $A, 2, $A0, $A0
		fcb 2, 0, 0, 2,	$A3, $A3, 5
byte_7ED8:	fcb 2, $A8, $A8, 2, 0, 0, 2, $2A
		fcb $2A, 2, 0, 0, 2, $A8, $A8, 2
		fcb 0, 0, 2, $2A, $2A, 2, 0, 0
		fcb 5
byte_7EF1:	fcb 2, $88, $88, 1, $22, $22, 1, 0
		fcb 0, 2, $CC, $CC, 2, $82, $82, 1
		fcb $28, $28, 1, 0, 0, 1, $AA, 0
		fcb 1, 0, $AA, 1, 0, 0,	2, $A8
		fcb $A8, 1, $2A, $2A, 5
byte_7F16:	fcb 1, $A, $A0,	1, $C0,	$C, 1, $A0
		fcb $A,	1, 0, 0, 1, $28, 0, 1
		fcb 3, $C0, 1, $28, $28, 1, 0, 0
		fcb 1, $80, $80, 1, $30, 3, 1, 2
		fcb 2, 1, $C, 0, 1, $28, 0, 1
		fcb 0, $30, 1, $82, $28, 1, 0, 0
		fcb 5
byte_7F47:	fcb 1, $80, $80, 1, $20, $20, 1, 8
		fcb 8, 1, $30, $C, 1, $2A, $2A,	1
		fcb $C0, $C0, 1, $20, $20, 1, 0, 0
		fcb 1, $20, $20, 1, $C0, $C0, 1, $20
		fcb $20, 1, $C0, $C0, 1, $A8, $A8, 1
		fcb 8, 8, 1, 3,	3, 1, 8, 8
		fcb 5
byte_7F78:	fcb 2, 0, 0, 2,	2, 2, 2, 0
		fcb 0, 1, $82, $82, 1, $3C, $3C, 1
		fcb $3C, $3C, 1, $82, $82, 2, 0, 0
		fcb 2, 2, 2, 2,	0, 0, 5
byte_7F97:	fcb 1, 0, 0, 1,	2, 2, 2, $8C
		fcb $8C, 1, 2, 2, 2, $B0, $B0, 1
		fcb 2, 2, 2, $8C, $8C, 1, 2, 2
		fcb 2, $B0, $B0, 1, 2, 2, 2, $80
		fcb $80, 5
byte_7FB9:	fcb 2, $A, $A, 2, $B0, $B0, 2, $2C
		fcb $2C, 2, $B,	$B, 2, 0, 0, 2
		fcb $E,	$E, 2, $38, $38, 2, $E0, $E0
		fcb 5
byte_7FD2:	fcb 1, 0, $AA, 1, 0, 0,	1, $AA
		fcb 0, 1, 0, 0,	1, 0, $AA, 1
		fcb 0, 0, 1, $AA, 0, 1,	0, 0
		fcb 1, 0, $AA, 1, 0, 0,	1, $AA
		fcb 0, 1, 0, 0,	1, 0, $AA, 1
		fcb 0, 0, 1, $AA, 0, 1,	0, 0
		fcb 5
byte_8003:	fcb 1, $B0, $B0, 1, $2C, $2C, 1, 8
		fcb 8, 2, 0, 0,	2, $A, $A, 2
		fcb $A0, $A0, 2, $A, $A, 2, 0, 0
		fcb 1, $B0, $B0, 1, $2C, $2C, 1, 8
		fcb 8, 5
byte_8025:	fcb 1, $AA, 0, 1, 0, 0,	1, 0
		fcb $AA, 1, 0, 0, 2, $AA, 0, 1
		fcb $A,	$A, 2, 0, 0, 1,	$A0, $A0
		fcb 2, $A, $A
byte_8040:	fcb 1, 0, $AA, 1, 0, 0,	1, $AA
		fcb 0, 1, 0, 0,	5
byte_804D:	fcb 2, 0, 0, 2,	$32, $E, 2, 2
		fcb 2, 2, 8, 8,	2, $C8,	$C8, 2
		fcb $20, $20, 2, $20, $20, 2, 0, 0
		fcb 5
byte_8066:	fcb 2, 0, 0, 2,	$8C, $8C, 2, $80
		fcb $80, 2, $23, $23, 2, $20, $20, 2
		fcb 8, 8, 2, $B, $B, 2,	0, 0
		fcb 5
byte_807F:	fcb 1, 0, 0, 2,	$2A, $2A, 1, $20
		fcb $20, 2, $C0, $C0, 2, $30, $30, 2
		fcb $CC, $CC, 2, $33, $33, 1, $C, $C
		fcb 4, 3, 3, 3
byte_809B:	fcb 1, $A8, $AA, 1, 0, 0, 1, 3
		fcb $AA, 2, $AA, 3, 1, 0, $AA, 1
		fcb 0, 0, 1, 0,	0, 1, $A2, $AA
		fcb 1, 0, 0, 1,	0, 0, 1, 0
		fcb $AA, 2, $AA, 0, 1, 0, $AA, 1
		fcb 0, 0, 5
byte_80C6:	fcb 1, 0, 0, 1,	$C0, $30, 2, $A
		fcb $A,	1, $30,	$C0, 1,	0, 0, 1
		fcb $C0, $30, 2, $A, $A, 1, $30, $C0
		fcb 1, 0, 0, 1,	$C0, $30, 2, $A
		fcb $A,	1, 0, 0, 1, 0, 0, 5
byte_80EE:	fcb 1, 2, 2, 2,	$30, $80, 2, $C
		fcb $20, 2, $C2, $A, 1,	2, 2, 2
		fcb $A,	$C2, 2,	$20, $C, 2, $80, $30
		fcb 2, 2, 2, 5
byte_810A:	fcb 1, 2, 2, 1,	$C0, $C0, 1, $20
		fcb $20, 1, $E,	$E, 1, 8, 8, 2
		fcb 0, 0, 1, 2,	2, 1, $2C, $2C
		fcb 1, $80, $80, 1, 2, 2, 2, 0
		fcb 0, 1, $8C, $8C, 1, $20, $20, 1
		fcb 3, 3, 5
byte_8135:	fcb 1, 3, 3, 2,	2, 2, 1, 8
		fcb 8, 2, $B0, $B0, 2, 8, 8, 1
		fcb $32, $32, 2, $C8, $C8, 2, $80, $80
		fcb 1, $20, $20, 2, $B,	$B, 5
byte_8154:	fcb 1, $E, $E, 2, $A, 0, 1, $A0
		fcb $A0, 2, 0, $A, 1, $FA, $FA,	2
		fcb $A,	0, 1, $A0, $A0,	2, 0, $A
		fcb 1, $FA, $FA, 2, $A,	0, 1, 2
		fcb 2, 5
byte_8176:	fcb 1, $AA, $2A, 1, 0, 0, 1, $AA
		fcb 3, 2, 3, $AA, 1, $AA, 0, 1
		fcb 0, 0, 1, 0,	0, 1, $AA, $8A
		fcb 1, 0, 0, 1,	0, 0, 1, $AA
		fcb 0, 2, 0, $AA, 1, $AA, 0, 1
		fcb 0, 0, 5
byte_81A1:	fcb 2, $2A, $2A, 1, 0, 0, 2, $A8
		fcb $A8, 1, 0, 0, 2, $2A, $2A, 1
		fcb 0, 0, 2, $A8, $A8, 1, 0, 0
		fcb 2, $8A, $AA, 1, 0, 0, 1, $AA
		fcb $A2, 5
byte_81C3:	fcb 1, 0, 0, 2,	$30, $C, 1, 0
		fcb 0, 2, 0, 0,	2, $C, $30, 1
		fcb 0, 0, 2, $30, $C, 1, 0, 0
		fcb 2, 0, 0, 2,	$C, $30, 5
byte_81E2:	fcb 2, 0, 0, 1,	0, 0, 1, 0
		fcb 0, 1, 0, 0,	2, 0, 0, 2
		fcb $3C, $3C, 2, 0, 0, 2, $C3, $C3
		fcb 1, 0, 0, 2,	0, 0, 5
byte_8201:	fcb 1, 0, 0, 1,	$C0, $C0, 2, $30
		fcb $30, 1, $C,	$C, 1, 3, 3, 2
		fcb 0, 0, 1, $C0, $C0, 2, $30, $30
		fcb 1, $C, $C, 1, 3, 3,	2, 0
		fcb 0, 1, 0, 0,	5
byte_8226:	fcb 2, 0, 0, 2,	2, 2, 2, $38
		fcb $38, 1, $A3, $A3, 1, 2, 2, 2
		fcb $8C, $8C, 2, 2, 2, 2, $38, $38
		fcb 2, 0, 0, 5
byte_8242:	fcb 1, 2, 2, 1,	0, 0, 2, $32
		fcb $C,	1, $C0,	$32, 2,	0, 0, 1
		fcb $83, $E3, 1, $30, 0, 2, 3, 0
		fcb 1, 0, $B2, 1, $AC, $C, 2, 0
		fcb 0, 1, 0, 0,	5
byte_8267:	fcb 2, 0, 0, 2,	0, 0, 1, $C3
		fcb $C3, 2, 0, 0, 1, $C3, $C3, 2
		fcb 0, 0, 1, $C3, $C3, 2, 0, 0
		fcb 1, $C3, $C3, 2, 0, 0, 5
byte_8286:	fcb 1, 0, 0, 2,	0, 0, 1, $C3
		fcb 0, 2, 0, 0,	2, $3C,	0, 1
		fcb 0, $C3, 2, 0, 0, 1,	0, $3C
		fcb 2, 0, 0, 2,	0, 0, 5
byte_82A5:	fcb 2, $AA, $8A, 2, 0, 0, 2, $BA
		fcb $AA, 2, 0, 0, 2, $AA, $AB, 2
		fcb 0, 0, 2, $AE, $AA, 2, 0, 0
		fcb 5
byte_82BE:	fcb 1, $14, $14, 1, $BF, $BF, 1, $14
		fcb $14, 5
byte_82C8:	fcb 1, 0, 0, 1,	$95, $95, 1, 0
		fcb 0, 5
byte_82D2:	fcb 1, 0, 0, 1,	$56, $56, 1, 0
		fcb 0, 5
byte_82DC:	fcb 1, 0, 0, 1,	$55, $55, 1, 0
		fcb 0, 5
byte_82E6:	fcb 1, $14, $14, 1, $FE, $FE, 1, $14
		fcb $14, 5
byte_82F0:	fcb 1, $14, $14, 1, $FF, $FF, 1, $14
		fcb $14, 5
byte_82FA:	fcb 1, $55, $55, 1, $15, $15, 1, 5
		fcb 5, 1, 0, 0,	1, 5, 5, 1
		fcb 0, 0, 1, 5,	5, 1, 0, 0
		fcb 1, 5, 5, 1,	0, 0, 1, 1
		fcb 1, 1, 0, 0,	1, 1, 1, 4
		fcb 0, 0, 3
byte_8325:	fcb 1, 0, 0, 2,	$2A, $2A, 1, 0
		fcb 0, 2, $40, $40, 2, $10, $10, 2
		fcb 4, 4, 2, 1,	1, 1, $FF, $FF
		fcb 4, $FF, $FF, 3

; =============== S U B	R O U T	I N E =======================================

; Entering trench

sub_8341:
		lda	#0
		sta	<DPbyte_44
		sta	<DPbyte_45
		ldx	#byte_4989
		lda	#0

loc_834C:
		sta	,x+
		cmpx	#word_49A9
		bcs	loc_834C
		ldb	byte_4B12
		aslb
		ldx	#off_7CC0
		abx
		cmpx	#off_7CC0+$16
		bcs	loc_8365
		ldu	#word_4B3F
		bra	loc_8367
; ---------------------------------------------------------------------------

loc_8365:
		ldu	,x

loc_8367:
		stu	word_49A9
		stu	word_49AB
		ldu	,u
		ldd	#0
		sta	word_49BF+1
		std	word_49B1
		std	word_49B5
		sta	<DPbyte_92
		sta	<DPbyte_95
		stu	word_49AF
		stu	word_49B3
		jsr	loc_8434
		jsr	sub_8408	; Trench
		jsr	sub_83CE
		jsr	sub_83CE
		jsr	sub_83CE
		jsr	sub_83CE
		jsr	sub_83CE
		jsr	sub_83CE
		jsr	sub_83CE
		jsr	sub_83CE
		rts
; End of function sub_8341


; =============== S U B	R O U T	I N E =======================================

; Called when starting trench

sub_83A4:
		ldu	#word_4B3F
		ldx	#off_7C7E	; Copy pointers	from ROM to RAM	starting at word_4B3F

loc_83AA:
		ldd	,x++
		std	,u++
		cmpu	#word_4B5F
		bcs	loc_83AA
		ldu	#word_4B43
		ldx	#off_7C9E

loc_83BA:
		lda	#$11
		ldb	PRNG
		mul
		asla
		ldd	a,x
		std	,u
		leau	4,u
		cmpu	#word_4B3F+$20
		bcs	loc_83BA
		rts
; End of function sub_83A4


; =============== S U B	R O U T	I N E =======================================


sub_83CE:
		lda	<DPbyte_92
		bne	locret_8407
		ldu	word_49B3
		leau	3,u
		lda	,u
		cmpa	#5
		bne	loc_83E2
		ldu	word_49AB
		ldu	2,u

loc_83E2:
		ldb	,u
		cmpb	#1
		bne	loc_83ED
		ldd	#$800
		bra	loc_83F9
; ---------------------------------------------------------------------------

loc_83ED:
		cmpb	#3
		bne	loc_83F6
		ldd	#0
		bra	loc_83F9
; ---------------------------------------------------------------------------

loc_83F6:
		ldd	#$1000

loc_83F9:
		addd	word_49B7
		subd	word_49B1
		subd	#$6000
		bhi	locret_8407
		jsr	sub_8408	; Trench

locret_8407:
		rts
; End of function sub_83CE


; =============== S U B	R O U T	I N E =======================================

; Trench

sub_8408:
		ldu	word_49B3
		ldb	,u
		cmpb	#1
		bne	loc_8416
		ldd	#$800
		bra	loc_8419
; ---------------------------------------------------------------------------

loc_8416:
		ldd	#$1000

loc_8419:
		addd	word_49B5
		std	word_49B5
		leau	3,u
		ldb	,u
		cmpb	#5
		bne	loc_8431
		ldu	word_49AB
		leau	2,u
		stu	word_49AB
		ldu	,u

loc_8431:
		stu	word_49B3

loc_8434:
		ldu	word_49B3
		ldb	,u
		cmpb	#3
		bne	loc_8447
		ldd	word_49B5
		std	<DPbyte_93
		lda	#$FF
		sta	<DPbyte_92
		rts
; ---------------------------------------------------------------------------

loc_8447:
		ldb	,u
		cmpb	#4
		bne	loc_846A
		ldd	word_49B5
		std	<DPbyte_96
		lda	#$FF
		sta	<DPbyte_95
		lda	#0
		sta	<DPbyte_44
		sta	<DPbyte_45
		lda	byte_4B36
		bne	loc_846A
		inc	byte_4B36
		jsr	sub_97E3
		ldu	word_49B3

loc_846A:
		ldb	,u
		cmpb	#1
		bne	loc_8475
		ldd	#$800
		bra	loc_8478
; ---------------------------------------------------------------------------

loc_8475:
		ldd	#$1000

loc_8478:
		addd	word_49B5
		std	word_49B7
		ldb	word_49B5
		lsrb
		lsrb
		lsrb
		andb	#$F
		ldx	#byte_4989
		lda	1,u
		sta	b,x
		ldx	#byte_4999
		lda	2,u
		sta	b,x
		rts
; End of function sub_8408


; =============== S U B	R O U T	I N E =======================================


sub_8495:
		lda	<DPbyte_45
		bne	locret_84B5
		ldb	byte_4B19
		cmpb	#7
		bls	loc_84A2
		ldb	#7

loc_84A2:
		aslb
		ldu	#byte_84B6
		leau	b,u
		lda	<DPbyte_43	; Game over/insert coins timer
		anda	,u
		bne	locret_84B5
		lda	1,u
		sta	<DPbyte_9B
		jsr	sub_84C6

locret_84B5:
		rts
; End of function sub_8495

; ---------------------------------------------------------------------------
byte_84B6:	fcb $F,	$80, $F, $60, $F, $40, $F, $20
		fcb 7, $60, 7, $20, 3, $60, 3, $20

; =============== S U B	R O U T	I N E =======================================


sub_84C6:
		ldd	#$F800
		anda	MReg4C
		adda	#$24 ; '$'
		std	MReg3C

loc_84D1:
		lda	MReg3C
		lsra
		lsra
		lsra
		anda	#$F
		sta	<DPbyte_99
		ldd	#$FE00
		std	MReg3E
		ldd	#$FC80
		std	MReg3D
		ldx	#byte_4989
		ldb	<DPbyte_99
		lda	b,x

loc_84EE:
		sta	<DPbyte_9A
		anda	#$C0 ; '¿'
		cmpa	#$C0 ; '¿'
		bne	loc_8522
		ldd	MReg4E
		subd	MReg3E
		blt	loc_8522
		subd	#$400
		bge	loc_850F
		lda	PRNG
		cmpa	<DPbyte_9B
		bcs	loc_850D
		jsr	sub_A7F7

loc_850D:
		bra	loc_8522
; ---------------------------------------------------------------------------

loc_850F:
		subd	#$400
		bge	loc_8522
		lda	PRNG
		ldb	PRNG
		mul
		cmpa	<DPbyte_9B
		bcs	loc_8522
		jsr	sub_A7F7

loc_8522:
		ldd	MReg3E
		subd	#$400
		std	MReg3E
		lda	<DPbyte_9A
		asla
		asla
		bne	loc_84EE
		ldd	#$FE00
		std	MReg3E
		ldd	#$380
		std	MReg3D
		ldx	#byte_4999
		ldb	<DPbyte_99
		lda	b,x

loc_8544:
		sta	<DPbyte_9A
		anda	#$C0 ; '¿'
		cmpa	#$C0 ; '¿'
		bne	loc_8578
		ldd	MReg4E
		subd	MReg3E
		blt	loc_8578
		subd	#$400
		bge	loc_8565
		lda	PRNG
		cmpa	<DPbyte_9B
		bcs	loc_8563
		jsr	sub_A80B

loc_8563:
		bra	loc_8578
; ---------------------------------------------------------------------------

loc_8565:
		subd	#$400
		bge	loc_8578
		lda	PRNG
		ldb	PRNG
		mul
		cmpa	<DPbyte_9B
		bcs	loc_8578
		jsr	sub_A80B

loc_8578:
		ldd	MReg3E
		subd	#$400
		std	MReg3E
		lda	<DPbyte_9A
		asla
		asla
		bne	loc_8544
		ldd	MReg3C
		addd	#$800
		std	MReg3C
		subd	MReg4C
		subd	#$6000
		lbcs	loc_84D1
		rts
; End of function sub_84C6


; =============== S U B	R O U T	I N E =======================================


sub_859B:
		lda	MReg20		; XT2
		lsra
		lsra
		lsra
		anda	#$F
		cmpa	word_49BF
		beq	loc_85DE
		ldb	word_49BF
		sta	word_49BF
		ldx	#byte_4989
		lda	b,x

loc_85B3:
		asla
		bcc	loc_85BD
		bmi	loc_85BD
		inc	word_49BF+1
		bra	loc_85D2
; ---------------------------------------------------------------------------

loc_85BD:
		asla
		bne	loc_85B3
		ldx	#byte_4999
		lda	b,x

loc_85C5:
		asla
		bcc	loc_85CF
		bmi	loc_85CF
		inc	word_49BF+1
		bra	loc_85D2
; ---------------------------------------------------------------------------

loc_85CF:
		asla
		bne	loc_85C5

loc_85D2:
		lda	#0
		ldx	#byte_4989
		sta	b,x
		ldx	#byte_4999
		sta	b,x

loc_85DE:
		jsr	sub_B3E4
		jsr	sub_85F9
		jsr	sub_8735
		jsr	sub_86AE
		lda	<DPbyte_95
		beq	loc_85F1
		jsr	sub_889F

loc_85F1:
		lda	<DPbyte_92
		beq	locret_85F8
		jsr	sub_88F5

locret_85F8:
		rts
; End of function sub_859B


; =============== S U B	R O U T	I N E =======================================


sub_85F9:
		ldd	#0
		std	MReg20		; XT2
		ldd	#$6270
		std	,y++
		ldu	#word_8696

loc_8607:
		lda	<DPbyte_92
		beq	loc_8618
		ldd	<DPbyte_93
		subd	MReg4C
		cmpd	#$7000
		bhi	loc_8618
		bra	loc_861B
; ---------------------------------------------------------------------------

loc_8618:
		ldd	#$7000

loc_861B:
		std	MReg3C
		ldd	,u
		std	MReg3D
		ldd	2,u
		std	MReg3E
		ldd	#$F		; Point	BIC to $5078 MReg3C
		std	MW1
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg00		; Math result X
		std	DVSRH
		jsr	sub_CCE4
		ldd	#$200
		std	MReg3C
		ldd	MReg3D
		subd	MReg4D
		bpl	loc_864E
		coma
		negb
		sbca	#$FF

loc_864E:
		cmpd	MReg3C
		ble	loc_8657
		std	MReg3C

loc_8657:
		ldd	MReg3E
		subd	MReg4E
		bpl	loc_8663
		coma
		negb
		sbca	#$FF

loc_8663:
		cmpd	MReg3C
		ble	loc_866C
		std	MReg3C

loc_866C:				; Point	BIC to $5078 MReg3C
		ldd	#$F
		std	MW1
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg00		; Math result X
		std	DVSRH
		jsr	sub_CCFC	; Trench floor lines calcs
		ldd	#byte_8040
		std	,y++
		leau	4,u
		cmpu	#word_8696+$18
		lbcs	loc_8607
		ldd	MReg4C
		std	MReg20		; XT2
		rts
; End of function sub_85F9

; ---------------------------------------------------------------------------
word_8696:	fdb $FC00
		fdb 0
		fdb $400
		fdb 0
		fdb $FC00
		fdb $F000
		fdb $FE00
		fdb $F000
		fdb $200
		fdb $F000
		fdb $400
		fdb $F000

; =============== S U B	R O U T	I N E =======================================


sub_86AE:
		ldd	#0
		std	MReg20		; XT2
		ldd	#$6250
		std	,y++
		ldu	#word_8725
		lda	<DPbyte_92
		beq	loc_86CD
		ldd	<DPbyte_93
		subd	MReg4C
		cmpd	#$7000
		bhi	loc_86CD
		bra	loc_86D0
; ---------------------------------------------------------------------------

loc_86CD:
		ldd	#$7000

loc_86D0:
		std	MReg3C
		ldd	,u
		std	MReg3D
		ldd	2,u
		std	MReg3E
		ldd	#$F
		std	MW1		; Point	BIC to $5078 MReg3C
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg00		; Math result X
		std	DVSRH
		jsr	sub_CCE4
		bra	loc_8711
; ---------------------------------------------------------------------------

loc_86F3:
		ldd	,u
		std	MReg3D
		ldd	2,u
		std	MReg3E
		ldd	#$F
		std	MW1		; Point	BIC to $5078 MReg3C
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg00		; Math result X
		std	DVSRH
		jsr	sub_CCFC	; Trench floor lines calcs

loc_8711:
		leau	4,u
		cmpu	#word_8725+$10
		bcs	loc_86F3
		ldd	#$8040
		std	,y++
		ldd	MReg4C
		std	MReg20		; XT2
		rts
; End of function sub_86AE

; ---------------------------------------------------------------------------
word_8725:	fdb $FC00
		fdb 0
		fdb $FC00
		fdb $F000
		fdb $400
		fdb $F000
		fdb $400
		fdb 0

; =============== S U B	R O U T	I N E =======================================


sub_8735:
		ldu	word_49AF
		ldb	,u
		cmpb	#3
		bne	loc_873F
		rts
; ---------------------------------------------------------------------------

loc_873F:
		cmpb	#1
		bne	loc_8748
		ldd	#$800
		bra	loc_874B
; ---------------------------------------------------------------------------

loc_8748:
		ldd	#$1000

loc_874B:
		addd	word_49B1
		subd	MReg20		; XT2
		bpl	loc_8786
		ldb	,u
		cmpb	#1
		bne	loc_875E
		ldd	#$800
		bra	loc_8761
; ---------------------------------------------------------------------------

loc_875E:
		ldd	#$1000

loc_8761:
		addd	word_49B1
		std	word_49B1
		leau	3,u
		stu	word_49AF
		ldb	,u
		cmpb	#3
		bne	loc_8773
		rts
; ---------------------------------------------------------------------------

loc_8773:
		ldb	,u
		cmpb	#5
		bne	loc_8783
		ldu	word_49A9
		leau	2,u
		stu	word_49A9
		ldu	,u

loc_8783:
		stu	word_49AF

loc_8786:
		ldd	#$6260
		std	,y++
		jsr	sub_83CE
		ldd	word_49A9
		std	word_49AD
		ldd	word_49AF
		std	word_49B9
		ldd	word_49B1
		std	word_49BB
		std	MReg3C
		ldd	#$FC00
		std	MReg3D
		jsr	sub_87CB
		ldd	word_49A9
		std	word_49AD
		ldd	word_49AF
		std	word_49B9
		ldd	word_49B1
		std	word_49BB
		std	MReg3C
		ldd	#$400
		std	MReg3D
		jsr	sub_87CB
		rts
; End of function sub_8735


; =============== S U B	R O U T	I N E =======================================


sub_87CB:
		ldd	word_49BB
		std	MReg3C
		subd	MReg20		; XT2
		lbmi	loc_8866
		cmpd	#$800
		bge	loc_87F5
		aslb
		rola
		coma
		negb
		sbca	#$FF
		addd	MReg22		; ZT2
		cmpd	#$F000
		bge	loc_87F0
		ldd	#$F000

loc_87F0:
		std	MReg3E
		bra	loc_8801
; ---------------------------------------------------------------------------

loc_87F5:
		ldd	word_49BB
		std	MReg3C
		ldd	#$F000
		std	MReg3E

loc_8801:
		lda	<DPbyte_92
		beq	loc_880E
		ldd	MReg3C
		subd	<DPbyte_93
		lbpl	locret_889E

loc_880E:
		ldd	MReg3C
		subd	MReg4C
		subd	#$7000
		lbpl	locret_889E
		ldd	#$F
		std	MW1		; Point	BIC to $5078 MReg3C
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg01		; Math result Y
		bpl	loc_882F
		coma
		negb
		sbca	#$FF

loc_882F:				; Math result X
		subd	MReg00
		bgt	loc_8866
		ldd	MReg00		; Math result X
		std	DVSRH
		ldd	#0
		std	<DPbyte_D6
		ldd	#$68 ; 'h'
		std	<DPbyte_D8
		jsr	sub_CD08	; Trench side vertical lines calcs
		ldd	#0
		std	MReg3E
		ldd	#$F
		std	MW1		; Point	BIC to $5078 MReg3C
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg00		; Math result X
		std	DVSRH
		jsr	sub_CCFC	; Trench floor lines calcs
		ldd	#$8040
		std	,y++

loc_8866:
		ldu	word_49B9
		ldb	,u
		cmpb	#1
		bne	loc_8874
		ldd	#$800
		bra	loc_8877
; ---------------------------------------------------------------------------

loc_8874:
		ldd	#$1000

loc_8877:
		addd	word_49BB
		std	word_49BB
		subd	MReg20		; XT2
		bmi	locret_889E
		leau	3,u
		ldb	,u
		cmpb	#3
		beq	locret_889E
		cmpb	#5
		bne	loc_8898
		ldu	word_49AD
		leau	2,u
		stu	word_49AD
		ldu	,u

loc_8898:
		stu	word_49B9
		jmp	loc_87F5
; ---------------------------------------------------------------------------

locret_889E:
		rts
; End of function sub_87CB


; =============== S U B	R O U T	I N E =======================================


sub_889F:
		ldb	#$10
		stb	<DPbyte_DC
		jsr	sub_CD38	; Trench left side turret calcs
		ldd	#$F000
		std	word_5E04
		ldd	#0
		std	word_5E02
		ldd	<DPbyte_96
		std	word_5E00
		ldd	#$1C0		; Point	BIC to math $5E00
		std	MW1
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg00		; Math result X
		cmpd	#$FE00
		bgt	loc_88D0
		lda	#0
		sta	<DPbyte_95
		rts
; ---------------------------------------------------------------------------

loc_88D0:
		subd	#$7000
		bgt	locret_88F4
		ldd	#$A018
		std	word_5E00
		ldd	#$7200
		std	word_5E04
		ldd	MReg00		; Math result X
		subd	#$1000
		bge	loc_88EE
		jsr	sub_CD5C	; Trench calcs
		bra	loc_88F1
; ---------------------------------------------------------------------------

loc_88EE:
		jsr	sub_CD50

loc_88F1:				; Function select for an object
		jsr	sub_CD74

locret_88F4:
		rts
; End of function sub_889F


; =============== S U B	R O U T	I N E =======================================


sub_88F5:
		ldd	#$6280
		std	,y++
		lda	<DPbyte_92
		beq	locret_8950
		ldd	<DPbyte_93
		std	MReg3C
		subd	MReg4C
		subd	#$7000
		bmi	loc_8911
		coma
		negb
		sbca	#$FF
		bra	loc_8914
; ---------------------------------------------------------------------------

loc_8911:
		ldd	#0

loc_8914:
		std	MReg3E
		ldd	#$FC00
		std	MReg3D
		ldd	#$F
		std	MW1		; Point	BIC to $5078 MReg3C
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg00		; Math result X
		std	DVSRH
		jsr	sub_CCE4
		ldd	#$400
		std	MReg3D
		ldd	#$F
		std	MW1		; Point	BIC to $5078 MReg3C
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg00		; Math result X
		std	DVSRH
		jsr	sub_CCFC	; Trench floor lines calcs
		ldd	#$8040
		std	,y++

locret_8950:
		rts
; End of function sub_88F5


; =============== S U B	R O U T	I N E =======================================

; Attributes: noreturn

sub_8951:
		jsr	sub_8981
		inc	<DPbyte_4D
		jmp	sub_89D3	; Space	wave pitch
; End of function sub_8951


; =============== S U B	R O U T	I N E =======================================

; Attributes: noreturn

sub_8959:
		jsr	sub_8993
		dec	<DPbyte_4D
		jmp	sub_89D3	; Space	wave pitch
; End of function sub_8959


; =============== S U B	R O U T	I N E =======================================

; Attributes: noreturn

sub_8961:
		jsr	sub_8993
		dec	<DPbyte_4E
		jmp	sub_89C8	; Space	wave roll
; End of function sub_8961


; =============== S U B	R O U T	I N E =======================================

; Attributes: noreturn

sub_8969:
		jsr	sub_8981
		inc	<DPbyte_4E
		jmp	sub_89C8	; Space	wave roll
; End of function sub_8969


; =============== S U B	R O U T	I N E =======================================

; Attributes: noreturn

sub_8971:
		jsr	sub_8981
		dec	<DPbyte_4F
		jmp	sub_89DE	; Space	wave yaw
; End of function sub_8971


; =============== S U B	R O U T	I N E =======================================

; Attributes: noreturn

sub_8979:
		jsr	sub_8993
		inc	<DPbyte_4F
		jmp	sub_89DE	; Space	wave yaw
; End of function sub_8979


; =============== S U B	R O U T	I N E =======================================


sub_8981:
		lda	#$14
		ldu	#word_89A8
		leau	a,u
		ldd	,u
		std	MReg11		; Sine for rotation
		ldd	2,u
		std	MReg12		; Cosine for rotation
		rts
; End of function sub_8981


; =============== S U B	R O U T	I N E =======================================


sub_8993:
		lda	#$14
		ldu	#word_89A8
		leau	a,u
		ldd	#0
		subd	,u
		std	MReg11		; Sine for rotation
		ldd	2,u
		std	MReg12		; Cosine for rotation
		rts
; End of function sub_8993

; ---------------------------------------------------------------------------
word_89A8:	fdb $B5, $3FFF,	$100, $3FFE, $16A, $3FFC, $21F,	$3FF7
		fdb $3DF, $3FE2, $4FF, $3FCE, $590, $3FC2, $590, $3FC2

; =============== S U B	R O U T	I N E =======================================

; Space	wave roll
; Attributes: noreturn

sub_89C8:
		clra
		ldb	2,x
		std	MW1
		lda	#0		; Roll
		jmp	Math_Run_Start	; Do math program run
; End of function sub_89C8


; =============== S U B	R O U T	I N E =======================================

; Space	wave pitch

sub_89D3:
		clra
		ldb	2,x
		std	MW1
		lda	#$E		; Pitch
		jmp	Math_Run_Start	; Do math program run
; End of function sub_89D3


; =============== S U B	R O U T	I N E =======================================

; Space	wave yaw

sub_89DE:
		clra
		ldb	2,x
		std	MW1
		lda	#$1C		; Yaw
		jmp	Math_Run_Start	; Do math program run
; End of function sub_89DE


; =============== S U B	R O U T	I N E =======================================


sub_89E9:
		ldd	-$10,u
		jsr	Shift_D_R_5	; Shift	D register right
		addd	-$A,u
		std	-$A,u
		ldd	-8,u
		jsr	Shift_D_R_5	; Shift	D register right
		addd	-2,u
		std	-2,u
		ldd	,u
		jsr	Shift_D_R_5	; Shift	D register right
		addd	6,u
		std	6,u
		rts
; End of function sub_89E9


; =============== S U B	R O U T	I N E =======================================


sub_8A05:
		ldd	-$10,u
		jsr	Shift_D_R_6	; Shift	D register right
		addd	-$A,u
		std	-$A,u
		ldd	-8,u
		jsr	Shift_D_R_6	; Shift	D register right
		addd	-2,u
		std	-2,u
		ldd	,u
		jsr	Shift_D_R_6	; Shift	D register right
		addd	6,u
		std	6,u
		rts
; End of function sub_8A05


; =============== S U B	R O U T	I N E =======================================


sub_8A21:
		ldd	-$C,u
		jsr	Shift_D_R_6	; Shift	D register right
		addd	-$A,u
		std	-$A,u
		ldd	-4,u
		jsr	Shift_D_R_6	; Shift	D register right
		addd	-2,u
		std	-2,u
		ldd	4,u
		jsr	Shift_D_R_6	; Shift	D register right
		addd	6,u
		std	6,u
		rts
; End of function sub_8A21


; =============== S U B	R O U T	I N E =======================================


sub_8A3D:
		ldd	-$C,u
		jsr	Shift_D_R_5	; Shift	D register right
		addd	-$A,u
		std	-$A,u
		ldd	-4,u
		jsr	Shift_D_R_5	; Shift	D register right
		addd	-2,u
		std	-2,u
		ldd	4,u
		jsr	Shift_D_R_5	; Shift	D register right
		addd	6,u
		std	6,u
		rts
; End of function sub_8A3D


; =============== S U B	R O U T	I N E =======================================


sub_8A59:
		ldd	#0
		subd	-$C,u
		jsr	Shift_D_R_6	; Shift	D register right
		addd	-$A,u
		std	-$A,u
		ldd	#0
		subd	-4,u
		jsr	Shift_D_R_6	; Shift	D register right
		addd	-2,u
		std	-2,u
		ldd	#0
		subd	4,u
		jsr	Shift_D_R_6	; Shift	D register right
		addd	6,u
		std	6,u
		rts
; End of function sub_8A59


; =============== S U B	R O U T	I N E =======================================


sub_8A7E:
		ldd	#0
		subd	-$C,u
		jsr	Shift_D_R_5	; Shift	D register right
		addd	-$A,u
		std	-$A,u
		ldd	#0
		subd	-4,u
		jsr	Shift_D_R_5	; Shift	D register right
		addd	-2,u
		std	-2,u
		ldd	#0
		subd	4,u
		jsr	Shift_D_R_5	; Shift	D register right
		addd	6,u
		std	6,u
		rts
; End of function sub_8A7E

; ---------------------------------------------------------------------------
		fcb $54, $CD, $E5, $2D,	$3F, $14, $12, $CD
		fcb $69, $F6, $AD, $33,	$AA, $28, $A6, $B
		fcb $F7, $58, $D1

; =============== S U B	R O U T	I N E =======================================


sub_8AB6:
		ldd	-$A,u
		addd	8,u
		bvs	loc_8ABE
		std	8,u

loc_8ABE:
		ldd	-2,u
		addd	$A,u
		bvs	loc_8AC6
		std	$A,u

loc_8AC6:
		ldd	$C,u
		addd	6,u
		bvs	locret_8ACE
		std	$C,u

locret_8ACE:
		rts
; End of function sub_8AB6

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_B32B

loc_8ACF:
		ldx	<DPbyte_C2
		lda	3,x
		cmpa	#1
		bne	locret_8ADB
		lda	6,x
		beq	loc_8ADC

locret_8ADB:
		rts
; ---------------------------------------------------------------------------

loc_8ADC:				; Update random	numbers
		jsr	Gen_Random
		lda	3,x
		cmpa	#1
		bne	loc_8AED
		ldd	$15,x
		orb	#1
		std	$15,x

loc_8AED:
		ldx	<DPbyte_C2
		inc	8,x
		dec	7,x
		lble	loc_8B57
		lda	#5
		sta	7,x
		jsr	sub_97ED	; Vaders tie score
		lda	#$1F
		sta	9,x
		sta	6,x
		ldx	#$5090
		ldu	<DPbyte_C2
		ldu	,u
		ldd	#0
		std	-$A,u
		std	-2,u
		std	6,u
		lda	#2
		sta	<DPbyte_1

loc_8B18:
		ldd	#$4000
		subd	<DPbyte_C4
		ldb	-$10,x
		mul
		tfr	a, b
		aslb
		rola
		sex
		addd	-$A,u
		std	-$A,u
		lda	<DPbyte_53
		ora	#$80 ; 'Ä'
		ldb	-8,x
		mul
		bcs	loc_8B33
		nega

loc_8B33:
		tfr	a, b
		nop
		sex
		addd	-2,u
		std	-2,u
		lda	<DPbyte_54
		ora	#$80 ; 'Ä'
		ldb	,x
		mul
		bcs	loc_8B45
		nega

loc_8B45:
		tfr	a, b
		nop
		sex
		addd	6,u
		std	6,u
		leax	2,x
		dec	<DPbyte_1
		bpl	loc_8B18
		jsr	Sound_35
		rts
; ---------------------------------------------------------------------------

loc_8B57:
		ldx	<DPbyte_C2
		jsr	Sound_35
		lda	2,x
		cmpa	word_4B38
		bne	loc_8B66
		jsr	Sound_2B

loc_8B66:
		jsr	sub_B739
		jsr	sub_97E8	; Tie fighter score
		rts
; END OF FUNCTION CHUNK	FOR sub_B32B

; =============== S U B	R O U T	I N E =======================================


sub_8B6D:
		ldx	#byte_4900	; 3x Tie fighter data structure	($19 bytes per Tie)

loc_8B70:
		stx	<DPbyte_5A
		ldu	,x
		lda	3,x
		beq	loc_8B7B
		jsr	sub_8BE1

loc_8B7B:
		ldx	<DPbyte_5A
		leax	$19,x
		cmpx	#byte_4900+$4B	; 3x Tie fighter data structure	($19 bytes per Tie)
		bcs	loc_8B70
		rts
; End of function sub_8B6D


; =============== S U B	R O U T	I N E =======================================


sub_8B86:
		ldx	#byte_4900	; 3x Tie fighter data structure	($19 bytes per Tie)

loc_8B89:
		stx	<DPbyte_5A
		ldu	,x
		lda	3,x
		cmpa	#1
		bne	loc_8BD6
		lda	$A,u
		cmpa	#9
		blt	loc_8B9B
		suba	#2

loc_8B9B:
		cmpa	#$F7 ; '˜'
		bgt	loc_8BA1
		adda	#2

loc_8BA1:
		sta	$A,u
		lda	$C,u
		cmpa	#9
		blt	loc_8BAB
		suba	#3

loc_8BAB:
		cmpa	#$F7 ; '˜'
		bgt	loc_8BB1
		adda	#3

loc_8BB1:
		sta	$C,u
		ldd	8,u
		addd	#$400
		bvs	loc_8BBE
		std	8,u
		bra	loc_8BD6
; ---------------------------------------------------------------------------

loc_8BBE:
		lda	$A,u
		tsta
		bpl	loc_8BC4
		nega

loc_8BC4:
		cmpa	#8
		bgt	loc_8BD6
		lda	$C,u
		tsta
		bpl	loc_8BCE
		nega

loc_8BCE:
		cmpa	#8
		bgt	loc_8BD6
		lda	#0
		sta	3,x

loc_8BD6:
		ldx	<DPbyte_5A
		leax	$19,x
		cmpx	#byte_4900+$4B	; 3x Tie fighter data structure	($19 bytes per Tie)
		bcs	loc_8B89
		rts
; End of function sub_8B86


; =============== S U B	R O U T	I N E =======================================


sub_8BE1:
		jsr	loc_8E3A
		ldd	#0
		sta	<DPbyte_4C
		sta	<DPbyte_4E
		sta	<DPbyte_4D
		sta	<DPbyte_4F
		lda	$15,x
		anda	#$10
		ldb	PRNG
		andb	#$30 ; '0'
		std	$15,x
		lda	9,x
		deca
		bmi	loc_8C15
		sta	9,x
		ldd	#$1640
		std	MReg11		; Sine for rotation
		ldd	#$3C02
		std	MReg12		; Cosine for rotation
		jsr	sub_89C8	; Space	wave roll
; ---------------------------------------------------------------------------
		jmp	loc_8C44
; ---------------------------------------------------------------------------

loc_8C15:
		ldb	$11,x
		stb	<DPbyte_50
		lsr	<DPbyte_50
		bcc	loc_8C21
		jsr	sub_8961
; ---------------------------------------------------------------------------

loc_8C21:
		lsr	<DPbyte_50
		bcc	loc_8C28
		jsr	sub_8969
; ---------------------------------------------------------------------------

loc_8C28:
		lsr	<DPbyte_50
		bcc	loc_8C2F
		jsr	sub_8951
; ---------------------------------------------------------------------------

loc_8C2F:
		lsr	<DPbyte_50
		bcc	loc_8C36
		jsr	sub_8959
; ---------------------------------------------------------------------------

loc_8C36:
		lsr	<DPbyte_50
		bcc	loc_8C3D
		jsr	sub_8979
; ---------------------------------------------------------------------------

loc_8C3D:
		lsr	<DPbyte_50
		bcc	loc_8C44
		jsr	sub_8971
; ---------------------------------------------------------------------------

loc_8C44:				; Some tie fighters process
		jsr	sub_8D9D
		jsr	sub_8DE3
		lda	3,x
		cmpa	#1
		lbne	loc_8D66
		lda	2,x
		jsr	sub_CE0C	; Copy transform data from [BIC] to matrix 2
		ldx	<DPbyte_5A
		clr	$A,x
		clra
		ldb	#$13
		std	MW1		; Point	BIC to $5098 MReg4C
		lda	$11,x
		bita	#$40 ; '@'
		beq	loc_8C81
		ldd	MReg4C
		addd	#$1000
		std	MReg4C
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg4C
		subd	#$1000
		std	MReg4C
		bra	loc_8C86
; ---------------------------------------------------------------------------

loc_8C81:
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run

loc_8C86:				; Math result X
		ldd	MReg00
		bmi	loc_8CAE
		inc	$A,x
		subd	#$4000
		bge	loc_8CAE
		ldd	$15,x
		orb	#8
		std	$15,x
		ldd	MReg39
		addd	MReg3A
		cmpd	#$20 ; ' '
		bhi	loc_8CAE
		ldd	$15,x
		orb	#4
		std	$15,x

loc_8CAE:
		ldd	$15,x
		bita	#$10
		beq	loc_8D05
		ldd	$11,x
		bita	#$40 ; '@'
		bne	loc_8D05
		ldd	MReg00		; Math result X
		subd	#$800
		ble	loc_8D05
		lda	6,x
		bne	loc_8D05
		ldb	byte_4B19
		cmpb	#$B
		bcs	loc_8CD4
		ldu	#byte_8D99
		bra	loc_8CDB
; ---------------------------------------------------------------------------

loc_8CD4:
		aslb
		aslb
		ldu	#byte_8D71
		leau	b,u

loc_8CDB:				; Game over/insert coins timer
		lda	<DPbyte_43
		anda	,u
		bne	loc_8D05
		lda	PRNG
		cmpa	1,u
		bls	loc_8D05
		ldu	2,u

loc_8CEA:
		lda	3,u
		bne	loc_8CFD
		ldx	<DPbyte_5A
		ldd	$15,x
		orb	#$40 ; '@'
		std	$15,x
		jsr	sub_A68B	; Emit fireballs from tie fighters
		bra	loc_8D05
; ---------------------------------------------------------------------------

loc_8CFD:
		leau	6,u
		cmpu	#byte_494B+$24	; 6x Fireball data structure 2 ($6 bytes per fireball)
		bcs	loc_8CEA

loc_8D05:
		ldx	<DPbyte_5A
		lda	$11,x
		bita	#$80 ; 'Ä'
		beq	loc_8D66
		lda	<DPbyte_4F
		bne	loc_8D3A
		lda	MReg01		; Math result Y
		bmi	loc_8D1C
		jsr	sub_8979
; ---------------------------------------------------------------------------
		bra	loc_8D1F
; ---------------------------------------------------------------------------

loc_8D1C:
		jsr	sub_8971
; ---------------------------------------------------------------------------

loc_8D1F:
		lda	<DPbyte_4E
		bne	loc_8D3A
		ldb	MReg02		; Math result Z
		sex
		addb	#1
		cmpb	#1
		bls	loc_8D3A
		eora	MReg01		; Math result Y
		bmi	loc_8D37
		jsr	sub_8961
; ---------------------------------------------------------------------------
		bra	loc_8D3A
; ---------------------------------------------------------------------------

loc_8D37:
		jsr	sub_8969
; ---------------------------------------------------------------------------

loc_8D3A:
		lda	<DPbyte_4D
		bne	loc_8D66
		lda	MReg02		; Math result Z
		bmi	loc_8D48
		jsr	sub_8951
; ---------------------------------------------------------------------------
		bra	loc_8D4B
; ---------------------------------------------------------------------------

loc_8D48:
		jsr	sub_8959
; ---------------------------------------------------------------------------

loc_8D4B:
		lda	<DPbyte_4E
		bne	loc_8D66
		ldb	MReg01		; Math result Y
		sex
		addb	#1
		cmpb	#1
		bls	loc_8D66
		eora	MReg02		; Math result Z
		bmi	loc_8D63
		jsr	sub_8969
; ---------------------------------------------------------------------------
		bra	loc_8D66
; ---------------------------------------------------------------------------

loc_8D63:
		jsr	sub_8961
; ---------------------------------------------------------------------------

loc_8D66:
		ldx	<DPbyte_5A
		ldd	$15,x
		anda	#$EF ; 'Ô'
		std	$15,x
		rts
; End of function sub_8BE1

; ---------------------------------------------------------------------------
byte_8D71:	fcb $F,	$80, $49, $69, $F, $80,	$49, $69
		fcb $F,	$80, $49, $63, $F, $40,	$49, $5D
		fcb 7, $80, $49, $57, 7, $20, $49, $51
		fcb 7, $20, $49, $4B, 3, $80, $49, $4B
		fcb 3, $60, $49, $4B, 3, $40, $49, $4B
byte_8D99:	fcb 3, $30, $49, $4B

; =============== S U B	R O U T	I N E =======================================

; Some tie fighters process

sub_8D9D:
		ldx	<DPbyte_5A
		ldu	,x
		lda	6,x
		bne	loc_8DDF
		ldb	$12,x
		stb	<DPbyte_50
		ldu	,x
		ldd	#0
		std	-$A,u
		std	-2,u
		std	6,u
		lsr	<DPbyte_50
		bcc	loc_8DBC
		jsr	sub_8A59

loc_8DBC:
		lsr	<DPbyte_50
		bcc	loc_8DC3
		jsr	sub_8A7E

loc_8DC3:
		lsr	<DPbyte_50
		bcc	loc_8DCA
		jsr	sub_8A21

loc_8DCA:
		lsr	<DPbyte_50
		bcc	loc_8DD1
		jsr	sub_8A3D

loc_8DD1:
		lsr	<DPbyte_50
		bcc	loc_8DD8
		jsr	sub_8A05

loc_8DD8:
		lsr	<DPbyte_50
		bcc	loc_8DDF
		jsr	sub_89E9

loc_8DDF:
		jsr	sub_8AB6
		rts
; End of function sub_8D9D


; =============== S U B	R O U T	I N E =======================================


sub_8DE3:
		ldu	,x
		ldd	8,u
		cmpa	#$7D ; '}'
		blt	loc_8DEE
		ldd	#$7CFF

loc_8DEE:
		cmpa	#$82 ; 'Ç'
		bgt	loc_8DF5
		ldd	#$8300

loc_8DF5:
		std	8,u
		ldd	$A,u
		cmpa	#$7D ; '}'
		blt	loc_8E00
		ldd	#$7CFF

loc_8E00:
		cmpa	#$82 ; 'Ç'
		bgt	loc_8E07
		ldd	#$8300

loc_8E07:
		std	$A,u
		ldd	$C,u
		cmpa	#$7D ; '}'
		blt	loc_8E12
		ldd	#$7CFF

loc_8E12:
		cmpa	#$82 ; 'Ç'
		bgt	loc_8E19
		ldd	#$8300

loc_8E19:
		std	$C,u
		rts
; End of function sub_8DE3


; =============== S U B	R O U T	I N E =======================================


sub_8E1C:
		dec	<DPbyte_E6
		bgt	locret_8E22
		clr	<DPbyte_E6

locret_8E22:
		rts
; End of function sub_8E1C


; =============== S U B	R O U T	I N E =======================================


sub_8E23:
		ldd	#0
		std	$11,x
		sta	$10,x
		std	$13,x
		std	$15,x

loc_8E32:
		ldu	$D,x
		lda	,u
		sta	$F,x
		beq	loc_8E51

loc_8E3A:
		ldd	$15,x
		anda	$13,x
		bne	loc_8E5C
		andb	$14,x
		bne	loc_8E5C
		lda	$F,x
		anda	#7
		asla
		ldu	#JumpTable8E68
		jmp	[a,u]
; ---------------------------------------------------------------------------

loc_8E51:
		ldd	1,u
		std	$13,x
		leau	3,u
		stu	$D,x
		bra	loc_8E32
; ---------------------------------------------------------------------------

loc_8E5C:
		ldu	$D,x

loc_8E5E:
		lda	,u
		beq	loc_8E32
		leau	3,u
		stu	$D,x
		bra	loc_8E5E
; End of function sub_8E23

; ---------------------------------------------------------------------------
JumpTable8E68:	fdb sub_8E79
		fdb sub_8E9B
		fdb sub_8EA4
		fdb sub_8EB2
		fdb sub_8EBA
		fdb sub_8ECE
		fdb sub_8E78
		fdb sub_8E78

; =============== S U B	R O U T	I N E =======================================


sub_8E78:
		swi
; End of function sub_8E78


; =============== S U B	R O U T	I N E =======================================


sub_8E79:
		ldu	$D,x

loc_8E7B:
		ldd	1,u
		beq	loc_8E94
		anda	$15,x
		bne	loc_8E94
		andb	$16,x
		bne	loc_8E94

loc_8E89:
		leau	3,u
		lda	,u
		asla
		bne	loc_8E89
		bcc	loc_8E89
		bra	loc_8E7B
; ---------------------------------------------------------------------------

loc_8E94:
		leau	3,u
		stu	$D,x
		jmp	loc_8E32
; End of function sub_8E79


; =============== S U B	R O U T	I N E =======================================


sub_8E9B:
		ldu	$D,x
		ldu	1,u
		stu	$D,x
		jmp	loc_8E32
; End of function sub_8E9B


; =============== S U B	R O U T	I N E =======================================


sub_8EA4:
		ldu	$D,x
		leau	3,u
		stu	$17,x
		ldu	-2,u
		stu	$D,x
		jmp	loc_8E32
; End of function sub_8EA4


; =============== S U B	R O U T	I N E =======================================


sub_8EB2:
		ldu	$17,x
		stu	$D,x
		jmp	loc_8E32
; End of function sub_8EB2


; =============== S U B	R O U T	I N E =======================================


sub_8EBA:
		ldu	$D,x
		ldb	,u
		lsrb
		stb	$10,x
		ldd	1,u
		std	$11,x
		leau	3,u
		stu	$D,x
		inc	$F,x
		rts
; End of function sub_8EBA


; =============== S U B	R O U T	I N E =======================================


sub_8ECE:
		dec	$10,x
		lbmi	loc_8E32
		rts
; End of function sub_8ECE


; =============== S U B	R O U T	I N E =======================================


sub_8ED6:
		jsr	sub_CCC0	; Initialise object?
		ldb	byte_4B14
		aslb
		ldx	#off_9070
		abx
		cmpx	#off_9070+$C
		bcs	loc_8EF4
		lda	byte_4B14
		lsra
		bcs	loc_8EF1
		ldx	#off_9078
		bra	loc_8EF4
; ---------------------------------------------------------------------------

loc_8EF1:
		ldx	#off_907A

loc_8EF4:
		ldx	,x
		ldb	<DPbyte_DD
		cmpb	,x+
		bls	loc_8EFE
		ldb	-1,x

loc_8EFE:
		aslb
		ldd	b,x
		std	<DPbyte_E4
		clr	<DPbyte_E6
		ldx	#byte_4900	; 3x Tie fighter data structure	($19 bytes per Tie)

loc_8F08:
		stx	<DPbyte_5A
		clr	3,x
		ldu	<DPbyte_E4
		beq	loc_8F29
		lda	,u
		beq	loc_8F29
		inc	<DPbyte_E6
		ldd	,u
		std	<DPbyte_E0	; Pointer to 3D	object index
		ldd	2,u
		std	<DPbyte_DE
		ldd	4,u
		std	<DPbyte_E2
		leau	6,u
		stu	<DPbyte_E4
		jsr	sub_8F34

loc_8F29:
		ldx	<DPbyte_5A
		leax	$19,x
		cmpx	#byte_4900+$4B	; 3x Tie fighter data structure	($19 bytes per Tie)
		bcs	loc_8F08
		rts
; End of function sub_8ED6


; =============== S U B	R O U T	I N E =======================================


sub_8F34:
		lda	#1		; Called 3 times at start of attract screen 1 and 2
		sta	3,x
		ldu	,x
		jsr	sub_CDC3	; Initialise math registers matrix
		ldu	,x
		lda	#$C0 ; '¿'      ; Matrix -1.000 constant
		sta	-$10,u
		sta	-6,u
		clra
		sta	9,x
		sta	8,x
		sta	6,x
		sta	5,x
		sta	$B,x
		ldu	<DPbyte_E0	; Pointer to 3D	object index
		lda	1,u
		sta	7,x
		ldu	,x
		ldx	<DPbyte_E2
		ldd	,x
		std	8,u
		ldd	2,x
		std	$A,u
		ldd	4,x
		std	$C,u
		ldx	<DPbyte_5A
		ldd	<DPbyte_DE
		std	$D,x
		jsr	sub_8E23
		ldx	<DPbyte_5A
		ldb	[word_48E0]	; Pointer to 3D	object index
		stb	4,x
		jsr	sub_CCCC	; Copy XYZ data	to math	RAM
		rts
; End of function sub_8F34


; =============== S U B	R O U T	I N E =======================================


sub_8F7B:
		ldu	<DPbyte_E4
		beq	loc_8F83
		lda	,u
		bne	loc_8FB1

loc_8F83:
		inc	<DPbyte_DD
		ldb	byte_4B14
		aslb
		ldx	#off_9070
		abx
		cmpx	#off_9070+$C
		bcs	loc_8FA0
		lda	byte_4B14
		lsra
		bcs	loc_8F9D
		ldx	#off_9078
		bra	loc_8FA0
; ---------------------------------------------------------------------------

loc_8F9D:
		ldx	#off_907A

loc_8FA0:
		ldx	,x
		ldb	<DPbyte_DD
		cmpb	,x+
		bls	loc_8FAA
		ldb	-1,x

loc_8FAA:
		stb	<DPbyte_DD
		aslb
		ldd	b,x
		std	<DPbyte_E4

loc_8FB1:				; 3x Tie fighter data structure	($19 bytes per Tie)
		ldx	#byte_4900

loc_8FB4:
		stx	<DPbyte_5A
		lda	3,x
		beq	loc_8FC6
		ldx	<DPbyte_5A
		leax	$19,x
		cmpx	#byte_4900+$4B	; 3x Tie fighter data structure	($19 bytes per Tie)
		bcs	loc_8FB4
		bra	locret_9023
; ---------------------------------------------------------------------------

loc_8FC6:
		ldu	<DPbyte_E4
		beq	locret_9023
		lda	,u
		beq	locret_9023
		inc	<DPbyte_E6
		ldd	,u
		std	<DPbyte_E0	; Pointer to 3D	object index
		ldd	2,u
		std	<DPbyte_DE
		ldd	4,u
		std	<DPbyte_E2
		leau	6,u
		stu	<DPbyte_E4
		lda	#1
		sta	3,x
		ldu	,x
		jsr	sub_CDC3	; Initialise math registers matrix
		ldu	,x
		lda	#$C0 ; '¿'
		sta	-$10,u
		sta	-6,u
		clra
		sta	9,x
		sta	8,x
		sta	6,x
		sta	5,x
		sta	$B,x
		ldu	<DPbyte_E0	; Pointer to 3D	object index
		lda	1,u
		sta	7,x
		ldu	,x
		ldx	<DPbyte_E2
		ldd	,x
		std	8,u
		ldd	2,x
		std	$A,u
		ldd	4,x
		std	$C,u
		ldx	<DPbyte_5A
		ldd	<DPbyte_DE
		std	$D,x
		jsr	sub_8E23
		ldx	<DPbyte_5A
		ldb	[word_48E0]	; Pointer to 3D	object index
		stb	4,x

locret_9023:
		rts
; End of function sub_8F7B

; ---------------------------------------------------------------------------
byte_9024:	fcb 0, 1
byte_9026:	fcb 4, 4
byte_9028:	fcb $7C, 0, 0, 0, 4, 0
byte_902E:	fcb $7C, 0, $FC, 0, 0, 0
byte_9034:	fcb $7C, 0, 4, 0, 0, 0
byte_903A:	fcb $7C, 0, 0, 0, 4, 0
byte_9040:	fcb $7C, 0, $FC, 0, 0, 0
byte_9046:	fcb $7C, 0, 4, 0, 0, 0
byte_904C:	fcb $7C, 0, 0, 0, 4, 0
byte_9052:	fcb $7C, 0, $FC, 0, 0, 0
byte_9058:	fcb $7C, 0, 4, 0, 0, 0
byte_905E:	fcb $7C, 0, $F8, 0, 0, 0
byte_9064:	fcb $7C, 0, 8, 0, 0, 0
byte_906A:	fcb $7C, 0, 0, 0, 8, 0
off_9070:	fdb byte_907C, byte_9085, byte_9090, byte_909F
off_9078:	fdb byte_90AC
off_907A:	fdb byte_90B9
byte_907C:	fcb 3
		fdb off_90C6, off_9138,	off_914B, off_9171
byte_9085:	fcb 4
		fdb off_90D9, off_9112,	off_915E, off_914B, off_9171
byte_9090:	fcb 6
		fdb off_90EC, off_9112,	off_915E, off_9125, off_9138, off_914B,	off_9171
byte_909F:	fcb 5
		fdb off_9112, off_915E,	off_9125, off_9138, off_914B, off_9171
byte_90AC:	fcb 5
		fdb off_90FF, off_9112,	off_914B, off_915E, off_9138, off_9171
byte_90B9:	fcb 5
		fdb off_9112, off_915E,	off_9138, off_915E, off_914B, off_9171
off_90C6:	fdb byte_9024, byte_91E1, byte_9028, byte_9024,	byte_9205, byte_902E, byte_9024, byte_9232
		fdb byte_9034
		fcb   0
off_90D9:	fdb byte_9024, byte_9277, byte_903A, byte_9024,	byte_92AD, byte_9040, byte_9024, byte_92D1
		fdb byte_9046
		fcb   0
off_90EC:	fdb byte_9024, byte_9319, byte_904C, byte_9024,	byte_933D, byte_9052, byte_9024, byte_9355
		fdb byte_9058
		fcb   0
off_90FF:	fdb byte_9024, byte_9385, byte_905E, byte_9024,	byte_93A9, byte_9064, byte_9024, byte_93DC
		fdb byte_906A
		fcb   0
off_9112:	fdb byte_9024, byte_9385, byte_905E, byte_9024,	byte_93A9, byte_9064, byte_9026, byte_93DC
		fdb byte_906A
		fcb   0
off_9125:	fdb byte_9024, byte_91DE, byte_9028, byte_9024,	byte_9202, byte_902E, byte_9024, byte_922F
		fdb byte_9034
		fcb   0
off_9138:	fdb byte_9024, byte_9274, byte_903A, byte_9024,	byte_92AA, byte_9040, byte_9024, byte_92CE
		fdb byte_9046
		fcb   0
off_914B:	fdb byte_9024, byte_9316, byte_904C, byte_9024,	byte_933A, byte_9052, byte_9024, byte_9352
		fdb byte_9058
		fcb   0
off_915E:	fdb byte_9024, byte_9382, byte_905E, byte_9024,	byte_93A6, byte_9064, byte_9024, byte_93D9
		fdb byte_906A
		fcb   0
off_9171:	fdb byte_9024, byte_91DE, byte_9028, byte_9024,	byte_9202, byte_902E, byte_9024, byte_922F
		fdb byte_9034, byte_9024, byte_9382, byte_905E,	byte_9024, byte_93A6, byte_9064, byte_9024
		fdb byte_93D9, byte_906A, byte_9024, byte_9274,	byte_903A, byte_9024, byte_92AA, byte_9040
		fdb byte_9024, byte_92CE, byte_9046, byte_9024,	byte_9382, byte_905E, byte_9024, byte_93A6
		fdb byte_9064, byte_9024, byte_93D9, byte_906A,	byte_9024, byte_9316, byte_904C, byte_9024
		fdb byte_933A, byte_9052, byte_9024, byte_9352,	byte_9058, byte_9024, byte_9382, byte_905E
		fdb byte_9024, byte_93A6, byte_9064, byte_9024,	byte_93D9, byte_906A
		fcb   0
byte_91DE:	fcb 2
		fdb byte_9421
byte_91E1:	fcb $84, 0, $10, $84, 0, $20, $44, 4
		fcb $10, 0, 0, 4, $44, $80, 0, 0
		fcb 4, 0, $84, $81, $10, 0, 0, 4
		fcb $44, $80, 0, 0, 0, 0
		fcb 1
		fdb byte_925C
byte_9202:	fcb 2
		fdb byte_9421
byte_9205:	fcb $84, 2, $20, $44, $10, $10,	0, 0
		fcb 4, $44, $90, $10, 0, 0, 0, $84
		fcb 2, $10, 0, 0, 4, $44, $90, $10
		fcb 0, 0, 0, $44, 2, $20, 0, 0
		fcb 4, $44, $90, $10, 0, 0, 0
		fcb 1
		fdb byte_925C
byte_922F:	fcb 2
		fdb byte_9421
byte_9232:	fcb $84, 1, $20, $44, $20, $10,	0, 0
		fcb 4, $44, $A0, $10, 0, 0, 0, $84
		fcb 1, $10, 0, 0, 4, $44, $A0, $10
		fcb 0, 0, 0, $44, 1, $20, 0, 0
		fcb 4, $44, $A0, $10, 0, 0, 0
		fcb 1
		fdb byte_925C
byte_925C:	fcb 0, 0, $44, $44, $82, $20, 0, 0
		fcb $40, $44, 1, $20
		fcb 1
		fdb byte_925C
		fcb 0, 0, 0, $24, 0, 8
		fcb 1
		fdb byte_925C
byte_9274:	fcb 2
		fdb byte_9421
byte_9277:	fcb $44, 0, $14, $44, 0, $11, $44, 0
		fcb $14, $44, 0, $11, $44, 4, $10, 0
		fcb 0, 4, $44, $80, 0, 0, 0, 0
		fcb $44, 0, $14, $44, 0, $11, $84, $80
		fcb $14, $44, 0, $14, $44, 0, $11, 0
		fcb 0, 4, $44, $80, 4, 0, 0, 0
		fcb 1
		fdb byte_92E9
byte_92AA:	fcb 2
		fdb byte_9421
byte_92AD:	fcb $24, 0, $18, $24, 0, $12, $24, 0
		fcb $28, $24, 0, $22, 0, 0, 4, $44
		fcb $80, $11, 0, 0, 0, 0, 0, 4
		fcb $44, $80, $14, 0, 0, 0
		fcb 1
		fdb byte_92E9
byte_92CE:	fcb 2
		fdb byte_9421
byte_92D1:	fcb $24, 0, $18, $24, 0, $12, $24, 0
		fcb $28, $24, 0, $22, 0, 0, 4, $44
		fcb $80, $11, 0, 0, 0
		fcb 1
		fdb byte_92E9
byte_92E9:	fcb 0, 0, $44, $44, $82, $20, 0, 0
		fcb $40, $44, 2, $20
		fcb 1
		fdb byte_92E9
		fcb 0, 0, 0, $24, 0, 8,	0, 4
		fcb 0, $FC, $82, $10, 0, 0, 0, $44
		fcb $82, 8, $44, $81, 2, $44, $81, 8
		fcb $44, $82, 2
		fcb 1
		fdb byte_92E9
byte_9316:	fcb 2
		fdb byte_9421
byte_9319:	fcb $24, 0, $14, $24, 0, $11, $24, 0
		fcb $14, $24, 0, $11, $44, 4, $10, 0
		fcb 0, 4, $44, $80, 0, 0, 0, 0
		fcb 0, 0, 4, $44, $80, 4, 0, 0
		fcb 0
byte_933A:	fcb 2
		fdb byte_9421
byte_933D:	fcb $44, $82, $14, $44,	$82, $24, $44, $10
		fcb $14, 0, 0, 4, $44, $90, $14, 0
		fcb 0, 0
		fcb 1
		fdb byte_936A
byte_9352:	fcb 2
		fdb byte_9421
byte_9355:	fcb $44, $81, $14, $44,	$81, $24, $44, $20
		fcb $14, 0, 0, 4, $44, $A0, $14, 0
		fcb 0, 0
		fcb 1
		fdb byte_936A
byte_936A:	fcb 0, 0, $44, $44, $82, $24, 0, 0
		fcb $40, $44, 1, $20
		fcb 1
		fdb byte_936A
		fcb 0, 0, 0, $24, 0, 2
		fcb 1
		fdb byte_936A
byte_9382:	fcb 2
		fdb byte_9421
byte_9385:	fcb 0, 4, 0, $FC, $82, $18, 0, 0
		fcb 0, $FC, $82, 8, $FC, $82, 8, $FC
		fcb $82, 8, $FC, $82, 8, 0, 0, 4
		fcb $44, $81, 8, 0, 0, 0
		fcb 1
		fdb byte_945A
byte_93A6:	fcb 2
		fdb byte_9421
byte_93A9:	fcb 0, 4, 0, $FC, $82, $18, 0, 0
		fcb 0, $84, $81, 8, $80, 0, $10, $44
		fcb $82, 8, $80, 0, 0, $84, $81, 8
		fcb $80, 0, $10, $44, $81, 8, $80, 0
		fcb 0, $84, $81, 8, 0, 0, 4, $44
		fcb $82, 8, 0, 0, 0
		fcb 1
		fdb byte_945A
byte_93D9:	fcb 2
		fdb byte_9421
byte_93DC:	fcb 0, 4, 0, $14, $80, $18, $14, $80
		fcb $12, $14, $80, $18,	$14, $80, $12, $14
		fcb $80, $18, $14, $80,	$12, $14, $80, $18
		fcb $14, $80, $12, 0, 0, 0, 0, 0
		fcb 1, $44, $B0, 8, $44, $8C, 8, $44
		fcb $B0, 2, $44, $8C, 2, $44, $B0, 8
		fcb $44, $8C, 8, $44, $B0, 2, $44, $8C
		fcb 2, 0, 0, 4,	$44, $81, $10, 0
		fcb 0, 0
		fcb 1
		fdb byte_945A
byte_9421:	fcb $C,	$80, $10, $80, 0, $10
		fcb 1
		fdb byte_943C
		fcb $80, 0, $20, $44, $80, $3C
		fcb 1
		fdb byte_944E
		fcb $80, 0, 0, $44, $80, $33
		fcb 1
		fdb byte_944E
byte_943C:	fcb $80, 0, $20, $44, $82, $3C
		fcb 1
		fdb byte_944E
		fcb $80, 0, 0, $44, $82, $33
		fcb 1
		fdb byte_944E
byte_944E:	fcb $80, 0, $20, $44, $41, $20,	$80, 0
		fcb 0, 3, 0, 0
byte_945A:	fcb $24, 0, 8, 0, 4, 0,	$84, $81
		fcb $20, 0, 0, $44, $44, $82, $20, 0
		fcb 0, $40, $44, 1, $10, 0, 0, 0
		fcb 0, $C, 0, $84, $81,	$20, 0,	8
		fcb $44, $44, $82, $20,	0, 8, $40, $44
		fcb 1, $10, 0, 0, 0, $80, 8, 0
		fcb 1
		fdb byte_9493
		fcb $80, 0, 0
		fcb 1
		fdb byte_945A
byte_9493:	fcb $80, 0, $10, $44, 2, 8
		fcb 1
		fdb byte_945A
		fcb $80, 0, 0, $44, 1, $20
		fcb 1
		fdb byte_945A
		fcb $B8, $5D, $78, $28,	$40, $EC, $D4, $B7
		fcb $2A, $89, $60, $C6,	$20, $84, $3D, $70
		fcb 0, $78, $ED, $B0, $68
		fcb $EF
		fdb byte_925C
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF
aCopyright1983At_0:fcc "COPYRIGHT 1983 ATARI"

; =============== S U B	R O U T	I N E =======================================


sub_953B:
		lda	byte_4592
		anda	#3
		beq	locret_9557
		adda	<DPbyte_60	; Shield count
		sta	<DPbyte_60	; Shield count
		lda	byte_4593
		anda	#3
		adda	#6
		cmpa	<DPbyte_60	; Shield count
		bcc	loc_9553
		sta	<DPbyte_60	; Shield count

loc_9553:
		lda	#$14
		sta	<DPbyte_61

locret_9557:
		rts
; End of function sub_953B


; =============== S U B	R O U T	I N E =======================================

; Process shields

sub_9558:
		lda	<DPbyte_8B
		ble	loc_95A0
		lda	<DPbyte_8C	; Sheild being depleted
		bgt	loc_95A0
		lda	#1
		sta	<DPbyte_8C	; Sheild being depleted
		lda	<DPbyte_60	; Shield count
		sta	<DPbyte_8E
		lda	#$F6 ; 'ˆ'
		adda	<DPbyte_60	; Shield count
		sta	<DPbyte_8D
		dec	<DPbyte_60	; Shield count
		bge	loc_9578
		lda	#$FF
		sta	<DPbyte_60	; Shield count
		clr	<DPbyte_8C	; Sheild being depleted

loc_9578:				; Shield count
		lda	<DPbyte_60
		cmpa	#0
		bne	loc_9586
		jsr	Sound_D
		jsr	Sound_28
		bra	loc_9599
; ---------------------------------------------------------------------------

loc_9586:
		cmpa	#1
		bne	loc_958F
		jsr	Sound_2F
		bra	loc_9599
; ---------------------------------------------------------------------------

loc_958F:
		cmpa	#2
		bne	loc_9599
		jsr	Sound_F
		jsr	Sound_30

loc_9599:
		clrb
		stb	<DPbyte_91
		stb	<DPbyte_90
		stb	<DPbyte_8F

loc_95A0:
		lda	<DPbyte_61
		beq	locret_95A6
		dec	<DPbyte_61

locret_95A6:
		rts
; End of function sub_9558


; =============== S U B	R O U T	I N E =======================================

; Insert vector	instructions for shields

sub_95A7:
		lda	<DPbyte_8C	; Sheild being depleted
		bne	loc_95B2
		lda	<DPbyte_60	; Shield count
		bgt	loc_95B2
		jmp	loc_9604
; ---------------------------------------------------------------------------

loc_95B2:				; Shield count
		ldb	<DPbyte_60
		aslb
		ldx	#word_96B6	; Shield colour	table
		ldu	b,x
		stu	,y++
		ldd	#$BA03
		std	,y++
		ldd	#$228
		std	,y++
		ldd	#0
		std	,y++
		lda	<DPbyte_8C	; Sheild being depleted
		beq	loc_95D4
		jsr	sub_962A
		bra	loc_95D7
; ---------------------------------------------------------------------------

loc_95D4:
		jsr	sub_960F

loc_95D7:
		ldd	#$1FD0
		std	,y++
		ldd	#$1FF4
		std	,y++
		lda	<DPbyte_8C	; Sheild being depleted
		ble	loc_95EA
		ldu	#$A018
		bra	loc_95F2
; ---------------------------------------------------------------------------

loc_95EA:				; Shield count
		ldb	<DPbyte_60
		aslb
		ldx	#word_96B6	; Shield colour	table
		ldu	b,x

loc_95F2:
		stu	,y++
		clr	<DPbyte_AD
		lda	<DPbyte_60	; Shield count
		bge	loc_95FB
		clra

loc_95FB:
		jsr	loc_E7AD
		ldd	#$8040
		std	,y++
		rts
; ---------------------------------------------------------------------------

loc_9604:
		ldd	#$7100
		std	,y++
		ldb	#$E
		jsr	sub_E7C7	; Print	text string from pointer table
		rts
; End of function sub_95A7


; =============== S U B	R O U T	I N E =======================================


sub_960F:
		ldb	<DPbyte_60	; Shield count
		aslb
		ldx	#word_96B6	; Shield colour	table
		ldd	b,x
		tst	<DPbyte_61
		beq	loc_961D
		orb	#$FF

loc_961D:
		std	,y++
		ldb	<DPbyte_60	; Shield count
		aslb
		ldx	#word_96CA	; Shield vector	table
		ldu	b,x
		stu	,y++
		rts
; End of function sub_960F


; =============== S U B	R O U T	I N E =======================================


sub_962A:
		lda	<DPbyte_91
		bne	loc_964B
		ldu	#$A018
		stu	,y++
		ldb	<DPbyte_8E
		aslb
		ldx	#word_96CA	; Shield vector	table
		ldu	b,x
		stu	,y++
		lda	<DPbyte_43	; Game over/insert coins timer
		anda	#0
		bne	loc_9649
		inc	<DPbyte_8D
		blt	loc_9649
		inc	<DPbyte_91

loc_9649:
		bra	locret_96A0
; ---------------------------------------------------------------------------

loc_964B:
		jsr	sub_96A1
		ldu	#$A018
		stu	,y++
		lda	<DPbyte_90
		bne	loc_9674
		ldb	<DPbyte_8E
		aslb
		ldx	#word_96DE	; Another copy of shield vector	table??
		ldu	b,x
		stu	,y++
		lda	<DPbyte_43	; Game over/insert coins timer
		anda	#0
		bne	loc_9672
		inc	<DPbyte_90
		ldb	<DPbyte_60	; Shield count
		ldx	#byte_9718
		lda	b,x
		sta	<DPbyte_8D

loc_9672:
		bra	locret_96A0
; ---------------------------------------------------------------------------

loc_9674:
		lda	<DPbyte_8F
		bne	loc_9690
		ldb	<DPbyte_8D
		aslb
		ldx	#word_96F2
		ldu	b,x
		stu	,y++
		lda	<DPbyte_43	; Game over/insert coins timer
		anda	#0
		bne	loc_968E
		dec	<DPbyte_8D
		bgt	loc_968E
		inc	<DPbyte_8F

loc_968E:
		bra	locret_96A0
; ---------------------------------------------------------------------------

loc_9690:				; Game over/insert coins timer
		lda	<DPbyte_43
		anda	#0
		bne	locret_96A0
		lda	#0
		sta	<DPbyte_8C	; Sheild being depleted
		sta	<DPbyte_8B
		lda	<DPbyte_60	; Shield count
		sta	<DPbyte_8E

locret_96A0:
		rts
; End of function sub_962A


; =============== S U B	R O U T	I N E =======================================


sub_96A1:
		ldb	<DPbyte_60	; Shield count
		aslb
		ldx	#word_96B6	; Shield colour	table
		ldd	b,x
		std	,y++
		ldb	<DPbyte_60	; Shield count
		aslb
		ldx	#word_96CA	; Shield vector	table
		ldu	b,x
		stu	,y++
		rts
; End of function sub_96A1

; ---------------------------------------------------------------------------
word_96B6:	fdb $6080, $6480, $6480, $6680,	$6680, $6280, $6280, $6280 ; Shield colour table
		fdb $6280, $6280
word_96CA:	fdb $BBE4, $BBE8, $BBEC, $BBF0,	$BBF4, $BBF8, $BBFC, $BC00 ; Shield vector table
		fdb $BC04, $BC08
word_96DE:	fdb $BBE6, $BBEA, $BBEE, $BBF2,	$BBF6, $BBFA, $BBFE, $BC02 ; Another copy of shield vector table??
		fdb $BC06, $BC0A
word_96F2:	fdb $BBBE, $BBC0, $BBC2, $BBC4,	$BBC6, $BBC8, $BBCA, $BBCC
		fdb $BBCE, $BBD0, $BBD2, $BBD4,	$BBD6, $BBD8, $BBDA, $BBDC
		fdb $BBDE, $BBE0, $BBE2
byte_9718:	fcb 0, 2, 4, 6,	8, $A, $C, $E
		fcb $10, $12

; =============== S U B	R O U T	I N E =======================================

; Death	Star starting wave bonus score

sub_9722:
		lda	byte_4B2D
		bne	locret_9739
		ldb	byte_4B15
		beq	locret_9739
		aslb
		addb	byte_4B15
		ldx	#byte_9865	; Death	Star destroyed	incrementing score value
					; Also has unused starting wave	bonus scores of	200,000	and 600,000
					; for waves 2 and 4
		abx
		tfr	x, u
		jsr	loc_9810	; Add to score total

locret_9739:
		rts
; End of function sub_9722


; =============== S U B	R O U T	I N E =======================================

; Towers incrementing score

sub_973A:
		ldu	#byte_4B2E	; Temporary score adder	towers 1
		jsr	loc_9810	; Add to score total
		ldx	#word_9856
		lda	byte_4B30	; Temporary score adder	towers 3
		adda	2,x
		daa
		sta	byte_4B30	; Temporary score adder	towers 3
		lda	byte_4B2F	; Temporary score adder	towers 2
		adca	1,x
		daa
		sta	byte_4B2F	; Temporary score adder	towers 2
		lda	byte_4B2E	; Temporary score adder	towers 1
		adca	,x
		daa
		sta	byte_4B2E	; Temporary score adder	towers 1
		lda	byte_4B1A
		beq	locret_9774
		adda	#$99 ; 'ô'
		daa
		sta	byte_4B1A
		bne	locret_9774
		ldu	#byte_9862	; Cleared all towers score value
		jsr	loc_9810	; Add to score total
		inc	byte_4B35

locret_9774:
		rts
; End of function sub_973A


; =============== S U B	R O U T	I N E =======================================

; Shield bonus score

sub_9775:
		ldb	<DPbyte_60	; Shield count
		beq	locret_97AB
		ldu	#byte_9865	; Death	Star destroyed	incrementing score value
					; Also has unused starting wave	bonus scores of	200,000	and 600,000
					; for waves 2 and 4
		lda	#0
		sta	word_4B29	; Temporary score adder	1
		sta	word_4B29+1	; Temporary score adder	1
		sta	byte_4B2B	; Temporary score adder	2

loc_9787:
		lda	2,u
		adda	byte_4B2B	; Temporary score adder	2
		daa
		sta	byte_4B2B	; Temporary score adder	2
		lda	1,u
		adca	word_4B29+1	; Temporary score adder	1
		daa
		sta	word_4B29+1	; Temporary score adder	1
		lda	,u
		adca	word_4B29	; Temporary score adder	1
		daa
		sta	word_4B29	; Temporary score adder	1
		decb
		bne	loc_9787
		ldu	#word_4B29	; Temporary score adder	1
		jsr	loc_9810	; Add to score total

locret_97AB:
		rts
; End of function sub_9775


; =============== S U B	R O U T	I N E =======================================

; Used the force score

sub_97AC:
		ldb	byte_4B15
		cmpb	#5
		bcs	loc_97B8
		ldu	#byte_9847	; Using	Force score value
		bra	locret_97C1
; ---------------------------------------------------------------------------

loc_97B8:
		aslb
		addb	byte_4B15
		ldu	#byte_983B
		leau	b,u

locret_97C1:
		rts
; End of function sub_97AC


; =============== S U B	R O U T	I N E =======================================


sub_97C2:
		ldd	#$A01A
		std	,y++
		ldd	#$180
		std	,y++
		ldd	#$1EC0
		std	,y++
		lda	#4
		sta	<DPbyte_AD
		jsr	sub_97AC	; Used the force score
		leax	-1,u
		jsr	sub_E772	; Display BCD number text
		ldb	#$50 ; 'P'      ; "For using the Force" text
		jsr	sub_E7C7	; Print	text string from pointer table
		rts
; End of function sub_97C2


; =============== S U B	R O U T	I N E =======================================


sub_97E3:
		jsr	sub_97AC	; Used the force score
		bra	loc_9810	; Add to score total
; End of function sub_97E3


; =============== S U B	R O U T	I N E =======================================

; Tie fighter score

sub_97E8:
		ldu	#byte_984A	; Tie fighter score value
		bra	loc_9810	; Add to score total
; End of function sub_97E8


; =============== S U B	R O U T	I N E =======================================

; Vaders tie score

sub_97ED:
		ldu	#byte_984D	; Vaders tie score value
		bra	loc_9810	; Add to score total
; End of function sub_97ED


; =============== S U B	R O U T	I N E =======================================

; Trench green squares score

sub_97F2:
		ldu	#byte_9850	; Trench green squares score value
		bra	loc_9810	; Add to score total
; End of function sub_97F2


; =============== S U B	R O U T	I N E =======================================

; Laser	tower score

sub_97F7:
		ldu	#byte_9859	; Laser	tower score value
		bra	loc_9810	; Add to score total
; End of function sub_97F7


; =============== S U B	R O U T	I N E =======================================

; Trench turrets score

sub_97FC:
		ldu	#byte_9853	; Trench turrets score value
		bra	loc_9810	; Add to score total
; End of function sub_97FC


; =============== S U B	R O U T	I N E =======================================

; Fireball score

sub_9801:
		ldu	#byte_985C	; Fireball score value
		bra	loc_9810	; Add to score total
; ---------------------------------------------------------------------------

loc_9806:				; Exhaust port score
		ldu	#byte_985F
		bra	loc_9810	; Add to score total
; ---------------------------------------------------------------------------
		ldu	#byte_9862	; Cleared all towers score value
		bra	*+2

loc_9810:				; Add to score total
		lda	2,u
		sta	byte_4B2B	; Temporary score adder	2
		adda	<DPbyte_5F	; Score
		daa
		sta	<DPbyte_5F	; Score
		lda	1,u
		sta	word_4B29+1	; Temporary score adder	1
		adca	<DPbyte_5E	; Score	thousands
		daa
		sta	<DPbyte_5E	; Score	thousands
		lda	,u
		sta	word_4B29	; Temporary score adder	1
		adca	<DPbyte_5D	; Score	hundred	thousands
		daa
		sta	<DPbyte_5D	; Score	hundred	thousands
		lda	<DPbyte_5C	; Score	millions
		adca	#0
		daa
		sta	<DPbyte_5C	; Score	millions
		lda	#$FF
		sta	byte_4B2C
		rts
; End of function sub_9801

; ---------------------------------------------------------------------------
byte_983B:	fcb 0, $50, 0, 1, 0, 0,	2, $50
		fcb 0, 5, 0, 0
byte_9847:	fcb $10, 0, 0		; Using	Force score value
byte_984A:	fcb 0, $10, 0		; Tie fighter score value
byte_984D:	fcb 0, $20, 0		; Vaders tie score value
byte_9850:	fcb 0, 0, $50		; Trench green squares score value
byte_9853:	fcb 0, 1, 0		; Trench turrets score value
word_9856:	fdb 2
byte_9858:	fcb 0
byte_9859:	fcb 0, 2, 0		; Laser	tower score value
byte_985C:	fcb 0, 0, $33		; Fireball score value
byte_985F:	fcb 2, $50, 0		; Exhaust port score value
byte_9862:	fcb 5, 0, 0		; Cleared all towers score value
byte_9865:	fcb 0, $50, 0, $20, 0, 0, $40, 0 ; Death Star destroyed	 incrementing score value
		fcb 0, $60, 0, 0, $80, 0, 0 ; Also has unused starting wave bonus scores of 200,000 and	600,000
					; for waves 2 and 4

; =============== S U B	R O U T	I N E =======================================


sub_9874:
		lda	<DPbyte_8B
		bne	locret_987E
		lda	#$10
		sta	<DPbyte_62	; Timer	for fireball hit?
		inc	<DPbyte_8B

locret_987E:
		rts
; End of function sub_9874


; =============== S U B	R O U T	I N E =======================================

; Fireball timer

sub_987F:
		lda	<DPbyte_43	; Game over/insert coins timer
		anda	#3
		sta	<DPbyte_62	; Timer	for fireball hit?
		rts
; End of function sub_987F


; =============== S U B	R O U T	I N E =======================================

; Fireball timer 2

sub_9886:
		ldb	<DPbyte_62	; Timer	for fireball hit?
		cmpb	#8
		bls	sub_9890	; Fireball timer 3
		ldb	#8
		stb	<DPbyte_62	; Timer	for fireball hit?
; End of function sub_9886


; =============== S U B	R O U T	I N E =======================================

; Fireball timer 3

sub_9890:
		ldb	<DPbyte_62	; Timer	for fireball hit?
		beq	locret_9897
		decb
		stb	<DPbyte_62	; Timer	for fireball hit?

locret_9897:
		rts
; End of function sub_9890


; =============== S U B	R O U T	I N E =======================================


sub_9898:
		lda	<DPbyte_43	; Game over/insert coins timer
		anda	#0
		bne	locret_98AF
		ldx	#byte_4900	; 3x Tie fighter data structure	($19 bytes per Tie)

loc_98A1:
		dec	6,x
		bpl	loc_98A7
		clr	6,x

loc_98A7:
		leax	$19,x
		cmpx	#byte_4900+$4B	; 3x Tie fighter data structure	($19 bytes per Tie)
		bcs	loc_98A1

locret_98AF:
		rts
; End of function sub_9898


; =============== S U B	R O U T	I N E =======================================

; Insert vector	laser explosion	small circle

sub_98B0:
		ldb	<DPbyte_62	; Timer	for fireball hit?
		andb	#3
		beq	locret_98CA
		ldd	#$7100
		std	,y++
		ldd	#$67FF
		std	,y++
		ldd	#$B9B3		; Vector JSRL 19B3 Laser explosion small circle
		std	,y++
		ldd	#$7200
		std	,y++

locret_98CA:
		rts
; End of function sub_98B0

; ---------------------------------------------------------------------------
byte_98CB:	fcb 0, $16, $16, $20, $20, $20,	$21, $21
		fcb $27, $28, $20, $20,	$24, $24, $24, $25
		fcb $25, $31
byte_98DD:	fcb $32
byte_98DE:	fcb $10, 0, $B0, 0, 3, 1, 0, $10, 0, $E0, 0, 3,	1, 1
		fcb $10, 0, $20, 0, 3, 1, 2, $10, 0, $50, 0, 3,	1, 3
		fcb $18, 0, $A0, 0, 1, 3, 4, $18, 0, $60, 0, 1,	2, 5
		fcb $20, 0, $B8, 0, 1, 2, 6, $20, 0, $48, 0, 1,	2, 7
		fcb $30, 0, $C0, 0, 3, 2, 8, $30, 0, 0,	0, 1, 0, 9
		fcb $30, 0, $40, 0, 3, 2, $A, $38, 0, $98, 0, 1, 3, $B
		fcb $38, 0, $F0, 0, 1, 0, $C, $38, 0, $10, 0, 1, 0, $D
		fcb $38, 0, $68, 0, 1, 3, $E, $40, 0, $90, 0, 3, 3, $F
		fcb $40, 0, $70, 0, 3, 3, $10, $50, 0, $90, 0, 1, 1, $11
		fcb $50, 0, 0, 0, 2, 1,	$12, $50, 0, $70, 0, 1,	1, $13
		fcb $54, 0, $E4, 0, 1, 1, $14, $54, 0, $1C, 0, 1, 1, $15
		fcb $58, 0, $C0, 0, 1, 0, $16, $58, 0, $40, 0, 1, 0, $17
		fcb $68, 0, $D8, 0, 1, 0, $18, $68, 0, $28, 0, 1, 0, $19
		fcb $70, 0, $F0, 0, 2, 2, $1A, $70, 0, $10, 0, 2, 2, $1B
byte_99A2:	fcb $80, 0, $90, 0, 1, 3, $1C, $80, 0, $D8, 0, 1, 0, $1D
		fcb $80, 0, $28, 0, 1, 0, $1E, $80, 0, $70, 0, 1, 2, $1F
byte_99BE:	fcb $30, 0, $88, 0, 1, 2, 0, $30, 0, $98, 0, 3,	2, 1
		fcb $30, 0, $A8, 0, 3, 2, 2, $30, 0, $B8, 0, 1,	2, 3
		fcb $30, 0, $E8, 0, 1, 0, 4, $30, 0, $F8, 0, 3,	0, 5
		fcb $30, 0, 8, 0, 3, 0,	6, $30,	0, $18,	0, 1, 0, 7
		fcb $30, 0, $48, 0, 1, 3, 8, $30, 0, $58, 0, 3,	3, 9
		fcb $30, 0, $68, 0, 3, 3, $A, $30, 0, $78, 0, 1, 3, $B
		fcb $40, 0, $90, 0, 1, 2, $C, $40, 0, $A0, 0, 3, 2, $D
		fcb $40, 0, $B0, 0, 1, 2, $E, $40, 0, $F0, 0, 1, 0, $F
		fcb $40, 0, $10, 0, 1, 0, $10, $40, 0, $50, 0, 1, 3, $11
		fcb $40, 0, $60, 0, 3, 3, $12, $40, 0, $70, 0, 1, 3, $13
		fcb $54, 0, $CC, 0, 3, 1, $14, $54, 0, $34, 0, 3, 1, $15
		fcb $60, 0, $A0, 0, 1, 1, $16, $60, 0, $E0, 0, 3, 0, $17
		fcb $60, 0, $20, 0, 3, 0, $18, $60, 0, $60, 0, 1, 1, $19
		fcb $74, 0, $E0, 0, 1, 1, $1A, $74, 0, $20, 0, 1, 1, $1B
byte_9A82:	fcb $80, 0, $98, 0, 1, 2, $1C, $80, 0, $B8, 0, 1, 2, $1D
		fcb $80, 0, $48, 0, 1, 3, $1E, $80, 0, $68, 0, 1, 3, $1F
byte_9A9E:	fcb 4, 0, $30, 0, 3, 1,	0, $C, 0, $20, 0, 3, 0,	1
		fcb $10, 0, $98, 0, 3, 1, 2, $14, 0, $48, 0, 3,	1, 3
		fcb $18, 0, $B0, 0, 3, 3, 4, $18, 0, $D0, 0, 3,	0, 5
		fcb $20, 0, $C0, 0, 3, 1, 6, $24, 0, $38, 0, 3,	2, 7
		fcb $24, 0, $70, 0, 3, 2, 8, $28, 0, 0,	0, 3, 0, 9
		fcb $30, 0, $88, 0, 3, 1, $A, $40, 0, $80, 0, 3, 1, $B
		fcb $44, 0, $60, 0, 3, 2, $C, $48, 0, $90, 0, 3, 1, $D
		fcb $48, 0, $A8, 0, 3, 3, $E, $4C, 0, $50, 0, 3, 2, $F
		fcb $50, 0, $E0, 0, 3, 3, $10, $50, 0, 0, 0, 3,	2, $11
		fcb $50, 0, $28, 0, 3, 0, $12, $68, 0, $B8, 0, 3, 3, $13
		fcb $68, 0, $D8, 0, 3, 0, $14, $70, 0, $A0, 0, 3, 3, $15
		fcb $70, 0, $E8, 0, 3, 0, $16, $70, 0, $18, 0, 3, 3, $17
		fcb $70, 0, $58, 0, 3, 3, $18, $78, 0, $F8, 0, 3, 0, $19
		fcb $78, 0, $40, 0, 3, 2, $1A, $78, 0, $68, 0, 3, 2, $1B
byte_9B62:	fcb 0, 0, $90, 0, 1, 0,	0, 0, 0, $B0, 0, 1, 0, 1
		fcb 0, 0, $D0, 0, 1, 0,	2, 0, 0, $F0, 0, 1, 0, 3
		fcb 0, 0, $10, 0, 1, 0,	4, 0, 0, $30, 0, 1, 0, 5
		fcb 0, 0, $50, 0, 1, 0,	6, 0, 0, $70, 0, 1, 0, 7
		fcb $10, 0, $C8, 0, 1, 2, 8, $28, 0, $C0, 0, 1,	2, 9
		fcb $30, 0, $88, 0, 1, 2, $A, $30, 0, $A8, 0, 1, 2, $B
		fcb $30, 0, $48, 0, 1, 2, $C, $30, 0, $68, 0, 1, 2, $D
		fcb $40, 0, $A0, 0, 1, 3, $E, $40, 0, $40, 0, 1, 2, $F
		fcb $40, 0, $60, 0, 1, 3, $10, $40, 0, $80, 0, 1, 3, $11
		fcb $60, 0, 0, 0, 1, 3,	$12, $68, 0, $84, 0, 1,	3, $13
		fcb $70, 0, $98, 0, 1, 1, $14, $70, 0, $B8, 0, 1, 1, $15
		fcb $70, 0, $D8, 0, 1, 1, $16, $70, 0, $F8, 0, 1, 1, $17
		fcb $70, 0, $18, 0, 1, 1, $18, $70, 0, $38, 0, 1, 1, $19
		fcb $70, 0, $58, 0, 1, 1, $1A, $70, 0, $78, 0, 1, 1, $1B
byte_9C26:	fcb $30, 0, $E8, 0, 1, 2, $1C, $30, 0, 8, 0, 1,	2, $1D
		fcb $40, 0, $F8, 0, 1, 3, $1E, $40, 0, $18, 0, 1, 3, $1F
byte_9C42:	fcb 8, 0, $A8, 0, 3, 2,	0, 8, 0, $58, 0, 3, 2, 1
		fcb $C,	0, $E8,	0, 1, 0, 2, $C,	0, $18,	0, 1, 0, 3
		fcb $14, 0, $C4, 0, 1, 0, 4, $14, 0, $3C, 0, 1,	0, 5
		fcb $28, 0, $A8, 0, 1, 2, 6, $28, 0, $58, 0, 1,	2, 7
		fcb $30, 0, 0, 0, 3, 0,	8, $38,	0, $E0,	0, 1, 0, 9
		fcb $38, 0, $20, 0, 1, 0, $A, $48, 0, $C0, 0, 1, 3, $B
		fcb $48, 0, $40, 0, 1, 3, $C, $50, 0, $90, 0, 1, 3, $D
		fcb $50, 0, $D8, 0, 3, 1, $E, $50, 0, $28, 0, 3, 1, $F
		fcb $50, 0, $70, 0, 1, 2, $10, $58, 0, $F0, 0, 3, 2, $11
		fcb $58, 0, $10, 0, 3, 2, $12, $68, 0, $B8, 0, 1, 0, $13
		fcb $68, 0, $48, 0, 1, 0, $14, $70, 0, $88, 0, 1, 3, $15
		fcb $70, 0, $A0, 0, 1, 1, $16, $70, 0, $D0, 0, 1, 3, $17
		fcb $70, 0, 0, 0, 1, 1,	$18, $70, 0, $30, 0, 1,	3, $19
		fcb $70, 0, $60, 0, 1, 1, $1A, $70, 0, $78, 0, 1, 3, $1B
byte_9D06:	fcb $80, 0, $B0, 0, 1, 0, $1C, $80, 0, $E8, 0, 1, 1, $1D
		fcb $80, 0, $18, 0, 1, 1, $1E, $80, 0, $50, 0, 1, 0, $1F
byte_9D22:	fcb $60, 0, $98, 0, 1, 2, 0, $10, 0, $68, 0, 1,	2, 1
		fcb $20, 0, $D0, 0, 3, 1, 2, $30, 0, $90, 0, 3,	2, 3
		fcb $30, 0, $E0, 0, 1, 0, 4, $30, 0, $20, 0, 1,	0, 5
		fcb $30, 0, $70, 0, 3, 2, 6, $38, 0, $B8, 0, 1,	1, 7
		fcb $38, 0, $48, 0, 1, 1, 8, $40, 0, $90, 0, 1,	3, 9
		fcb $40, 0, $E8, 0, 3, 0, $A, $40, 0, $18, 0, 3, 0, $B
		fcb $40, 0, $48, 0, 1, 1, $C, $50, 0, $E0, 0, 3, 0, $D
		fcb $50, 0, $F0, 0, 1, 0, $E, $50, 0, $10, 0, 1, 0, $F
		fcb $50, 0, $20, 0, 3, 0, $10, $60, 0, $88, 0, 1, 3, $11
		fcb $60, 0, $A0, 0, 1, 2, $12, $60, 0, $C0, 0, 1, 1, $13
		fcb $60, 0, $D0, 0, 1, 1, $14, $60, 0, $F8, 0, 1, 0, $15
		fcb $60, 0, 8, 0, 1, 0,	$16, $60, 0, $30, 0, 1,	1, $17
		fcb $60, 0, $40, 0, 1, 1, $18, $60, 0, $60, 0, 1, 2, $19
		fcb $60, 0, $80, 0, 1, 2, $1A, $70, 0, 0, 0, 1,	0, $1B
byte_9DE6:	fcb $80, 0, $A8, 0, 1, 3, $1C, $80, 0, $E0, 0, 1, 3, $1D
		fcb $80, 0, $20, 0, 1, 3, $1E, $80, 0, $58, 0, 1, 3, $1F
byte_9E02:	fcb 0, 0, $B8, 0, 1, 2,	0, 0, 0, $48, 0, 1, 2, 1
		fcb $10, 0, $A0, 0, 1, 3, 2, $10, 0, $E0, 0, 1,	1, 3
		fcb $10, 0, $F8, 0, 1, 0, 4, $10, 0, 8,	0, 1, 0, 5
		fcb $10, 0, $20, 0, 1, 1, 6, $20, 0, $C8, 0, 1,	1, 7
		fcb $20, 0, $38, 0, 1, 1, 8, $2C, 0, $E4, 0, 1,	0, 9
		fcb $2C, 0, $1C, 0, 1, 0, $A, $30, 0, $90, 0, 1, 3, $B
		fcb $40, 0, 0, 0, 3, 1,	$C, $50, 0, 0, 0, 1, 1,	$D
		fcb $50, 0, $80, 0, 3, 3, $E, $60, 0, $E8, 0, 3, 1, $F
		fcb $60, 0, $18, 0, 3, 1, $10, $60, 0, $80, 0, 1, 3, $11
		fcb $70, 0, $88, 0, 3, 2, $12, $70, 0, $A0, 0, 1, 0, $13
		fcb $70, 0, $B0, 0, 1, 0, $14, $70, 0, $F0, 0, 1, 3, $15
		fcb $70, 0, $10, 0, 1, 3, $16, $70, 0, $50, 0, 1, 0, $17
		fcb $70, 0, $60, 0, 1, 0, $18, $70, 0, $78, 0, 3, 2, $19
		fcb $78, 0, $E0, 0, 3, 3, $1A, $78, 0, $20, 0, 3, 3, $1B
byte_9EC6:	fcb $40, 0, $B0, 0, 1, 2, $1C, $40, 0, $C0, 0, 1, 2, $1D
		fcb $40, 0, $30, 0, 1, 2, $1E, $40, 0, $40, 0, 1, 2, $1F
byte_9EE2:	fcb $20, 0, $80, 0, 3, 2, 0, $20, 0, $A0, 0, 3,	1, 1
		fcb $20, 0, $B0, 0, 3, 1, 2, $20, 0, $50, 0, 3,	1, 3
		fcb $20, 0, $60, 0, 3, 1, 4, $30, 0, $80, 0, 1,	2, 5
		fcb $30, 0, $A0, 0, 1, 1, 6, $30, 0, $B0, 0, 1,	1, 7
		fcb $30, 0, $D0, 0, 3, 1, 8, $30, 0, $E0, 0, 3,	0, 9
		fcb $30, 0, 0, 0, 3, 0,	$A, $30, 0, $20, 0, 3, 0, $B
		fcb $30, 0, $30, 0, 3, 1, $C, $30, 0, $50, 0, 1, 1, $D
		fcb $30, 0, $60, 0, 1, 1, $E, $40, 0, $D0, 0, 1, 2, $F
		fcb $40, 0, $E0, 0, 1, 0, $10, $40, 0, 0, 0, 1,	0, $11
		fcb $40, 0, $20, 0, 1, 0, $12, $40, 0, $30, 0, 1, 2, $13
		fcb $48, 0, $58, 0, 3, 2, $14, $54, 0, $70, 0, 3, 2, $15
		fcb $60, 0, $90, 0, 1, 3, $16, $60, 0, $70, 0, 1, 3, $17
		fcb $68, 0, $F0, 0, 1, 0, $18, $68, 0, $10, 0, 1, 0, $19
		fcb $70, 0, $C0, 0, 1, 1, $1A, $70, 0, $40, 0, 1, 1, $1B
byte_9FA6:	fcb $80, 0, $A0, 0, 1, 3, $1C, $80, 0, $E0, 0, 1, 3, $1D
		fcb $80, 0, $20, 0, 1, 3, $1E, $80, 0, $60, 0, 1, 3, $1F
byte_9FC2:	fcb 0, 0, 0, 0,	1, 1, 0, $18, 0, $80, 0, 1, 3, 1
		fcb $20, 0, $D8, 0, 1, 1, 2, $20, 0, $28, 0, 1,	1, 3
		fcb $30, 0, $90, 0, 1, 2, 4, $30, 0, $60, 0, 3,	2, 5
		fcb $30, 0, $70, 0, 1, 2, 6, $38, 0, $B0, 0, 1,	3, 7
		fcb $38, 0, $E0, 0, 1, 0, 8, $38, 0, $20, 0, 1,	0, 9
		fcb $38, 0, $50, 0, 1, 3, $A, $48, 0, $E8, 0, 1, 0, $B
		fcb $48, 0, $18, 0, 1, 0, $C, $50, 0, $88, 0, 1, 2, $D
		fcb $50, 0, $A0, 0, 1, 3, $E, $50, 0, $C0, 0, 1, 1, $F
		fcb $50, 0, $40, 0, 1, 1, $10, $50, 0, $60, 0, 1, 3, $11
		fcb $50, 0, $78, 0, 1, 2, $12, $5C, 0, $E4, 0, 1, 0, $13
		fcb $5C, 0, $1C, 0, 1, 0, $14, $60, 0, $F0, 0, 1, 0, $15
		fcb $60, 0, $10, 0, 1, 0, $16, $60, 0, $7C, 0, 1, 3, $17
		fcb $70, 0, $C8, 0, 1, 1, $18, $70, 0, $F8, 0, 1, 0, $19
		fcb $70, 0, 8, 0, 1, 0,	$1A, $70, 0, $38, 0, 1,	1, $1B
byte_A086:	fcb 0, 0, $A0, 0, 1, 3,	$1C, 0,	0, $C0,	0, 1, 2, $1D
		fcb 0, 0, $40, 0, 1, 2,	$1E, 0,	0, $60,	0, 1, 3, $1F
byte_A0A2:	fcb $10, 0, $E0, 0, 1, 1, 0, $10, 0, $20, 0, 1,	1, 1
		fcb $20, 0, $C0, 0, 3, 1, 2, $20, 0, $40, 0, 3,	1, 3
		fcb $28, 0, $E0, 0, 1, 0, 4, $28, 0, $20, 0, 1,	0, 5
		fcb $30, 0, $90, 0, 3, 2, 6, $30, 0, $A0, 0, 3,	2, 7
		fcb $30, 0, $60, 0, 3, 2, 8, $38, 0, $B0, 0, 1,	1, 9
		fcb $38, 0, $50, 0, 1, 1, $A, $40, 0, $D0, 0, 3, 0, $B
		fcb $40, 0, 0, 0, 3, 0,	$C, $40, 0, $30, 0, 3, 0, $D
		fcb $40, 0, $80, 0, 1, 1, $E, $50, 0, $88, 0, 1, 2, $F
		fcb $50, 0, 0, 0, 1, 0,	$10, $50, 0, $78, 0, 1,	2, $11
		fcb $60, 0, $C0, 0, 1, 0, $12, $60, 0, $40, 0, 1, 0, $13
		fcb $68, 0, $D0, 0, 1, 0, $14, $68, 0, $30, 0, 1, 0, $15
		fcb $70, 0, $90, 0, 1, 1, $16, $70, 0, $A0, 0, 1, 1, $17
		fcb $70, 0, $F0, 0, 1, 0, $18, $70, 0, $10, 0, 1, 0, $19
		fcb $70, 0, $60, 0, 1, 1, $1A, $70, 0, $70, 0, 1, 1, $1B
byte_A166:	fcb $10, 0, $B8, 0, 1, 2, $1C, $10, 0, $58, 0, 1, 2, $1D
		fcb $20, 0, $98, 0, 1, 2, $1E, $20, 0, $70, 0, 1, 2, $1F
off_A182:	fdb byte_9A9E, byte_9B62, byte_9EE2, byte_9FA6,	byte_99BE, byte_9A82, byte_A0A2, byte_A166
		fdb byte_9E02, byte_9EC6, byte_98DE, byte_99A2,	byte_9D22, byte_9DE6, byte_9C42, byte_9D06
		fdb byte_9FC2, byte_A086, byte_9B62, byte_9C26,	byte_9EE2, byte_9FC2, byte_99BE, byte_9A9E
		fdb byte_A0A2, off_A182, byte_9E02, byte_9EE2, byte_98DE, byte_99BE, byte_9D22,	byte_9E02
		fdb byte_9C42, byte_9D22, byte_9FC2, byte_A0A2
off_A1CA:	fdb byte_9B62, byte_9C42

; =============== S U B	R O U T	I N E =======================================


sub_A1CE:
		ldu	#byte_49C2	; Tie fighter data 1

loc_A1D1:
		lda	#0
		sta	,u
		leau	1,u
		cmpu	#byte_49C2+$20	; Tie fighter data 1
		bcs	loc_A1D1
		lda	byte_4B13
		cmpa	#$13
		bcs	loc_A1EF
		ldb	#6
		lda	PRNG
		mul
		adda	#$D
		sta	byte_4B13

loc_A1EF:
		ldb	byte_4B13
		ldx	#byte_98CB
		abx
		cmpx	#byte_98DE
		bcs	loc_A1FE
		ldx	#byte_98DD

loc_A1FE:
		lda	,x
		sta	byte_4B1A
		ldd	word_9856
		std	byte_4B2E	; Temporary score adder	towers 1
		lda	byte_9858
		sta	byte_4B30	; Temporary score adder	towers 3
		lda	#0
		sta	<DPbyte_A7
		rts
; End of function sub_A1CE


; =============== S U B	R O U T	I N E =======================================


sub_A214:
		ldb	#7
		stb	<DPbyte_DC
		jsr	sub_CD38	; Trench left side turret calcs
		ldd	#0
		std	MReg20		; XT2
		std	MReg21		; YT2
		std	MReg22		; ZT2
		jsr	sub_A40A	; Some Towers code
		ldd	MReg4C
		std	MReg20		; XT2
		ldd	MReg4D
		std	MReg21		; YT2
		ldd	MReg4E
		std	MReg22		; ZT2
		ldb	byte_4B13
		aslb
		aslb
		ldx	#off_A182
		abx
		cmpx	#off_A182+$4C
		bcs	loc_A24D
		ldx	#off_A1CA

loc_A24D:
		ldx	,x

loc_A24F:				; Pointer to Tie fighter data
		stx	<DPbyte_64
		lda	<DPbyte_A7
		cmpa	5,x
		lblt	loc_A2DA
		ldd	,x
		std	word_5E00
		ldd	2,x
		std	word_5E02
		ldd	#$1E00
		std	word_5E04
		ldd	#$1C0
		std	MW1
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg00		; Math result X
		bpl	loc_A27E
		anda	#$3F ; '?'
		std	MReg00		; Math result X

loc_A27E:
		std	MReg3E
		cmpd	#$100
		blt	loc_A2B0
		cmpd	#$3C00
		bcc	loc_A2B0
		ldd	MReg01		; Math result Y
		bpl	loc_A296
		coma
		negb
		sbca	#$FF

loc_A296:				; Math result X
		subd	MReg00
		bcc	loc_A2B0
		ldu	#byte_49C2	; Tie fighter data 1
		ldb	6,x
		leau	b,u
		lda	,u
		bita	#2
		beq	loc_A2AE
		jsr	sub_A2F8
		jsr	sub_A591

loc_A2AE:
		bra	loc_A2DA
; ---------------------------------------------------------------------------

loc_A2B0:				; Pointer to Tie fighter data
		ldx	<DPbyte_64
		ldu	#byte_49C2	; Tie fighter data 1
		ldb	6,x
		leau	b,u
		lda	byte_4B3D
		beq	loc_A2C2
		clr	,u
		bra	loc_A2DA
; ---------------------------------------------------------------------------

loc_A2C2:
		lda	#$B
		ldb	,u
		bitb	#4
		beq	loc_A2D6
		ora	#4
		ldb	4,x
		cmpb	#3
		bne	loc_A2D4
		anda	#$FD ; '˝'

loc_A2D4:
		bra	loc_A2D8
; ---------------------------------------------------------------------------

loc_A2D6:
		ora	#$10

loc_A2D8:
		sta	,u

loc_A2DA:
		ldb	byte_4B13
		aslb
		aslb
		ldx	#off_A182
		abx
		cmpx	#off_A182+$4C
		bcs	loc_A2EB
		ldx	#off_A1CA

loc_A2EB:
		tfr	x, u
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		leax	7,x
		cmpx	2,u
		lbcs	loc_A24F
		rts
; End of function sub_A214


; =============== S U B	R O U T	I N E =======================================


sub_A2F8:
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		ldb	4,x
		cmpb	#3
		bne	loc_A304
		ldb	#9
		bra	loc_A306
; ---------------------------------------------------------------------------

loc_A304:
		ldb	#8

loc_A306:
		stb	<DPbyte_DC
		ldd	#$6680
		std	word_5E02
		ldu	#byte_49C2	; Tie fighter data 1
		ldb	6,x
		leau	b,u
		lda	,u
		ldb	4,x
		cmpb	#3
		beq	loc_A333
		bita	#4
		bne	loc_A325
		bita	#$10
		bne	loc_A32E

loc_A325:
		ldb	#$A
		stb	<DPbyte_DC
		ldd	#$6080
		bra	loc_A331
; ---------------------------------------------------------------------------

loc_A32E:
		ldd	#$6780

loc_A331:
		bra	loc_A33F
; ---------------------------------------------------------------------------

loc_A333:
		bita	#4
		bne	loc_A33C
		ldd	#$6460
		bra	loc_A33F
; ---------------------------------------------------------------------------

loc_A33C:
		ldd	#$6080

loc_A33F:
		std	word_5E00
		lda	#$72 ; 'r'
		sta	word_5E04
		lda	MReg00		; Math result X
		asla
		asla
		sta	word_5E04+1
		ldb	#$40 ; '@'
		coma
		mul
		adda	#$40 ; '@'
		sta	word_5E02+1
		ldd	MReg43
		aslb
		rola
		addd	#$400
		subd	MReg00		; Math result X
		lblt	loc_A3F4
		lda	4,x
		cmpa	#3
		beq	loc_A3A7
		lda	<DPbyte_60	; Shield count
		blt	loc_A374
		jsr	Sound_2C

loc_A374:				; Math result X
		ldd	MReg00
		subd	#$200
		subd	MReg43
		bgt	loc_A3A5
		ldd	#$A018
		std	word_5E02
		ldd	#$6080
		std	word_5E00
		lda	<DPbyte_60	; Shield count
		blt	loc_A395
		jsr	sub_9874
		jsr	Sound_26	; Explosion

loc_A395:
		lda	<DPbyte_63
		bne	loc_A39D
		lda	MReg01		; Math result Y
		nega

loc_A39D:
		ldb	#$20 ; ' '
		tsta
		bpl	loc_A3A3
		negb

loc_A3A3:
		stb	<DPbyte_63

loc_A3A5:
		bra	loc_A3F4
; ---------------------------------------------------------------------------

loc_A3A7:				; ZT2
		ldd	MReg22
		subd	#$7A0
		bgt	loc_A3F4
		jsr	Sound_2C
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		ldu	#byte_49C2	; Tie fighter data 1
		ldb	6,x
		leau	b,u
		lda	,u
		bita	#4
		bne	loc_A3F4
		ldd	MReg22		; ZT2
		subd	#$5A0
		bge	loc_A3F4
		ldd	MReg00		; Math result X
		subd	#$400
		subd	MReg43
		bgt	loc_A3F4
		ldd	#$A018
		std	word_5E00
		lda	<DPbyte_60	; Shield count
		blt	loc_A3E4
		jsr	sub_9874
		jsr	Sound_26	; Explosion

loc_A3E4:
		lda	<DPbyte_63
		bne	loc_A3F4
		lda	#$13
		ldb	MReg01		; Math result Y
		bmi	loc_A3F0
		nega

loc_A3F0:
		adda	<DPbyte_63
		sta	<DPbyte_63

loc_A3F4:				; Math result X
		lda	MReg00
		suba	#8
		bgt	loc_A400
		jsr	sub_CD68
		bra	loc_A403
; ---------------------------------------------------------------------------

loc_A400:
		jsr	sub_CD50

loc_A403:				; Function select for an object
		jsr	sub_CD74
		jsr	sub_A459	; Some Towers code
		rts
; End of function sub_A2F8


; =============== S U B	R O U T	I N E =======================================

; Some Towers code

sub_A40A:
		jsr	sub_CDE7	; Swap Matrix 2	 x, y, z to  x,	y, z
		ldd	#0
		std	MReg3C
		ldd	<DPbyte_B3
		std	MReg3D
		ldd	<DPbyte_B5
		std	MReg3E
		ldd	#$F
		std	MW1		; Point	BIC to $5078 MReg3C
		lda	#$2A ; '*'      ; Reg00 = (([BIC,0] - XT) x Ax2)  +  (([BIC,1] - YT) x Bx2)  +  (([BIC,2] - ZT) x Cx2)
					; Reg01	= (([BIC,0] - XT) x Ay2)  +  (([BIC,1] - YT) x By2)  +	(([BIC,2] - ZT)	x Cy2)
					; Reg02	= (([BIC,0] - XT) x Az2)  +  (([BIC,1] - YT) x Bz2)  +	(([BIC,2] - ZT)	x Cz2)
					; BIC++
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg01		; Math result Y
		std	MReg3C
		ldd	MReg02		; Math result Z
		std	MReg3D
		bpl	loc_A455
		lda	<DPbyte_BC
		beq	loc_A455
		lda	#$FF
		sta	<DPbyte_BD
		lda	#3
		sta	byte_4B23
		ldd	#$6280
		std	word_4B20
		ldd	MReg02		; Math result Z
		lsra
		rorb
		lsra
		rorb
		addb	#$C0 ; '¿'
		stb	byte_4B22

loc_A455:				; Called during	towers phase only
		jsr	sub_CDE7
		rts
; End of function sub_A40A


; =============== S U B	R O U T	I N E =======================================

; Some Towers code

sub_A459:
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		ldd	MReg3E
		aslb
		rola
		std	DVSRH
		ldd	2,x
		subd	MReg21		; YT2
		std	MReg01		; Math result Y
		ldd	#0
		subd	MReg22		; ZT2
		std	MReg02		; Math result Z
		ldd	MW0
		std	MReg00		; Math result X
		lda	#$86 ; 'Ü'      ; MReg01 = MReg01 x MReg00
					; MReg02 = MReg02 x MReg00
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg01		; Math result Y
		std	MReg0D		; YT
		ldd	MReg02		; Math result Z
		std	MReg0E		; ZT
		lda	4,x
		cmpa	#3
		beq	loc_A49F
		ldd	#$3C0
		std	MReg01		; Math result Y
		ldd	#$5280
		std	MReg02		; Math result Z
		bra	loc_A4BA
; ---------------------------------------------------------------------------

loc_A49F:				; Tie fighter data 1
		ldu	#byte_49C2
		ldb	6,x
		leau	b,u
		lda	,u
		bita	#4
		lbne	locret_A54A
		ldd	#$690
		std	MReg01		; Math result Y
		ldd	#$5A0
		std	MReg02		; Math result Z

loc_A4BA:				; Math result X
		ldd	MReg00
		subd	#$100
		bpl	loc_A4C5
		ldd	#0

loc_A4C5:				; Math result X
		std	MReg00
		lda	#$86 ; 'Ü'      ; MReg01 = MReg01 x MReg00
					; MReg02 = MReg02 x MReg00
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg0D		; YT
		addd	MReg01		; Math result Y
		addd	#$A
		subd	MReg3C
		lblt	locret_A54A
		asra
		rorb
		subd	#$A
		subd	MReg01		; Math result Y
		lbgt	locret_A54A
		ldd	MReg3D
		subd	MReg0E		; ZT
		bmi	locret_A54A
		subd	MReg02		; Math result Z
		bgt	locret_A54A
		lda	4,x
		cmpa	#3
		bne	loc_A50A
		ldd	MReg3E
		cmpd	<DPbyte_C8
		bcc	loc_A508
		std	<DPbyte_C8
		stx	<DPbyte_C6

loc_A508:
		bra	locret_A54A
; ---------------------------------------------------------------------------

loc_A50A:
		ldd	#$4CE0
		std	MReg01		; Math result Y
		lda	#$86 ; 'Ü'      ; MReg01 = MReg01 x MReg00
					; MReg02 = MReg02 x MReg00
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg3D
		addd	#$A
		subd	MReg0E		; ZT
		subd	MReg01		; Math result Y
		blt	loc_A53E
		ldu	#byte_49C2	; Tie fighter data 1
		ldb	6,x
		leau	b,u
		lda	,u
		bita	#4
		bne	locret_A54A
		ldd	MReg3E
		cmpd	<DPbyte_C8
		bcc	loc_A53C
		std	<DPbyte_C8
		stx	<DPbyte_C6

loc_A53C:
		bra	locret_A54A
; ---------------------------------------------------------------------------

loc_A53E:
		ldd	MReg3E
		cmpd	<DPbyte_D0
		bcc	locret_A54A
		std	<DPbyte_D0
		stx	<DPbyte_CE

locret_A54A:
		rts
; End of function sub_A459

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_B2D2

loc_A54B:
		ldx	<DPbyte_C6
		ldd	,x
		subd	MReg4C
		anda	#$7F ; ''
		addd	MReg4C
		std	MReg0C		; XT
		ldd	2,x
		std	MReg0D		; YT
		ldu	#byte_49C2	; Tie fighter data 1
		ldb	6,x
		leau	b,u
		lda	,u
		ora	#4
		sta	,u
		lda	4,x
		cmpa	#3
		bne	loc_A580
		ldd	#$2D0
		std	MReg0E		; ZT
		jsr	sub_B852
		jsr	sub_97F7	; Laser	tower score
		bra	loc_A58C
; ---------------------------------------------------------------------------

loc_A580:
		ldd	#$5460
		std	MReg0E		; ZT
		jsr	sub_B85E
		jsr	sub_973A	; Towers incrementing score

loc_A58C:
		jsr	Sound_35
		rts
; END OF FUNCTION CHUNK	FOR sub_B2D2
; ---------------------------------------------------------------------------
		fcb $39	; 9

; =============== S U B	R O U T	I N E =======================================


sub_A591:

; FUNCTION CHUNK AT A728 SIZE 0000008E BYTES

		lda	<DPbyte_60	; Shield count
		blt	locret_A5B2
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		ldu	#byte_49C2	; Tie fighter data 1
		ldb	6,x
		leau	b,u
		lda	,u
		bita	#4
		bne	locret_A5B2
		lda	4,x
		cmpa	#2
		lbeq	loc_A608
		lbhi	loc_A655
		bra	loc_A5B3
; ---------------------------------------------------------------------------

locret_A5B2:
		rts
; ---------------------------------------------------------------------------

loc_A5B3:
		ldd	#$4000
		subd	MReg3E
		aslb
		rola
		std	MReg00		; Math result X
		ldd	#$2940
		std	MReg02		; Math result Z
		ldd	#$2D0
		std	MReg01		; Math result Y
		lda	#$86 ; 'Ü'      ; MReg01 = MReg01 x MReg00
					; MReg02 = MReg02 x MReg00
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg02		; Math result Z
		subd	MReg22		; ZT2
		bge	loc_A5DE
		lda	,u
		ora	#8
		sta	,u
		rts
; ---------------------------------------------------------------------------

loc_A5DE:				; Math result Y
		subd	MReg01
		ble	loc_A5E9
		lda	,u
		bita	#8
		beq	locret_A607

loc_A5E9:
		lda	,u
		anda	#$F7 ; '˜'
		sta	,u
		lda	PRNG
		bpl	loc_A5F7
		jsr	sub_A7B6	; Emit fireballs from towers/bunkers

loc_A5F7:
		lda	PRNG
		bpl	loc_A5FF
		jsr	sub_A7C8	; Emit fireballs from towers/bunkers 2

loc_A5FF:
		lda	PRNG
		bpl	locret_A607
		jsr	sub_A7BF

locret_A607:
		rts
; ---------------------------------------------------------------------------

loc_A608:
		ldd	#$4000
		subd	MReg3E
		aslb
		rola
		std	MReg00		; Math result X
		ldd	#$2940
		std	MReg02		; Math result Z
		ldd	#$2D0
		std	MReg01		; Math result Y
		lda	#$86 ; 'Ü'      ; MReg01 = MReg01 x MReg00
					; MReg02 = MReg02 x MReg00
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg02		; Math result Z
		subd	MReg22		; ZT2
		bge	loc_A633
		lda	,u
		ora	#8
		sta	,u
		rts
; ---------------------------------------------------------------------------

loc_A633:				; Math result Y
		subd	MReg01
		ble	loc_A63E
		lda	,u
		bita	#8
		beq	locret_A654

loc_A63E:
		lda	,u
		anda	#$F7 ; '˜'
		sta	,u
		lda	PRNG
		bpl	loc_A64C
		jsr	sub_A7C8	; Emit fireballs from towers/bunkers 2

loc_A64C:
		lda	PRNG
		bpl	locret_A654
		jsr	sub_A7BF

locret_A654:
		rts
; ---------------------------------------------------------------------------

loc_A655:
		lda	#$40 ; '@'
		suba	MReg3E
		cmpa	PRNG
		bcs	locret_A674
		lda	PRNG
		cmpa	#$50 ; 'P'
		bcc	loc_A669
		jmp	loc_A728
; ---------------------------------------------------------------------------

loc_A669:
		lda	PRNG
		bpl	loc_A671
		jmp	loc_A728
; ---------------------------------------------------------------------------

loc_A671:
		jmp	loc_A728
; ---------------------------------------------------------------------------

locret_A674:
		rts
; End of function sub_A591

; ---------------------------------------------------------------------------
JumpTableA675:	fdb sub_A86B
		fdb sub_A875
		fdb sub_A8A7
		fdb sub_A8DA		; Some towers processing
		fdb loc_A8E6
		fdb loc_A8F9
		fdb loc_AA00
		fdb loc_A946
		fdb loc_A9A3
		fdb sub_AA86		; Exhaust port processing
		fdb sub_AAB5

; =============== S U B	R O U T	I N E =======================================

; Emit fireballs from tie fighters

sub_A68B:
		stu	<DPbyte_A8	; Fireball data	pointer
		ldb	#$40 ; '@'
		stb	5,u
		ldb	#1
		stb	3,u
		ldb	#1
		stb	4,u
		lda	word_4B3B+1
		ble	loc_A6AB
		cmpx	byte_4B32
		bne	loc_A6AB
		dec	word_4B3B+1
		bne	loc_A6AB
		jsr	Sound_12

loc_A6AB:
		ldu	,u
		ldx	,x
		ldd	8,x
		subd	MReg4C
		std	,u
		ldd	$A,x
		subd	MReg4D
		std	2,u
		ldd	$C,x
		subd	MReg4E
		std	4,u
		jsr	Sound_36
		rts
; End of function sub_A68B

; ---------------------------------------------------------------------------
off_A6C8:	fdb byte_4969, byte_4969, byte_4963, byte_4963,	byte_495D, byte_495D, byte_4957, byte_4957 ; 6x	Fireball data structure	2 ($6 bytes per	fireball)
		fdb byte_4951, byte_4951, byte_494B
off_A6DE:	fdb byte_494B		; 6x Fireball data structure 2 ($6 bytes per fireball)

; =============== S U B	R O U T	I N E =======================================

; Emit fireballs from towers 4

sub_A6E0:
		ldb	byte_4B19
		cmpb	#$C
		bcs	loc_A6EC
		ldx	#off_A6DE
		bra	loc_A6F2
; ---------------------------------------------------------------------------

loc_A6EC:
		aslb
		ldx	#off_A6C8
		ldx	b,x

loc_A6F2:
		bra	loc_A708
; End of function sub_A6E0


; =============== S U B	R O U T	I N E =======================================


sub_A6F4:
		ldb	byte_4B19
		cmpb	#7
		bls	loc_A6FD
		ldb	#7

loc_A6FD:
		aslb
		ldx	#off_A718
		ldx	b,x
		bra	loc_A708
; End of function sub_A6F4


; =============== S U B	R O U T	I N E =======================================

; Emit fireballs from towers 3

sub_A705:
		ldx	#byte_494B	; 6x Fireball data structure 2 ($6 bytes per fireball)

loc_A708:				; Fireball data	pointer
		stx	<DPbyte_A8
		lda	3,x
		beq	locret_A717
		leax	6,x
		cmpx	#byte_494B+$24	; 6x Fireball data structure 2 ($6 bytes per fireball)
		bcs	loc_A708
		leas	2,s		; Do not return	to last	function call ?

locret_A717:
		rts
; End of function sub_A705

; ---------------------------------------------------------------------------
off_A718:	fdb byte_4969
		fdb byte_4969
		fdb byte_4963
		fdb byte_4963
		fdb byte_495D
		fdb byte_495D
		fdb byte_495D
		fdb byte_4957
; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_A591

loc_A728:				; Emit fireballs from towers 4
		jsr	sub_A6E0
		lda	#$70 ; 'p'
		sta	5,x
		lda	#5
		sta	3,x
		ldu	<DPbyte_64	; Pointer to Tie fighter data
		stx	<DPbyte_1
		ldd	2,u
		subd	MReg4D
		bmi	loc_A742
		lda	#8
		bra	loc_A744
; ---------------------------------------------------------------------------

loc_A742:
		lda	#7

loc_A744:
		sta	4,x
		ldx	,x
		lda	,u
		suba	MReg4C
		anda	#$80 ; 'Ä'
		eora	,u
		ldb	1,u
		std	,x
		ldd	2,u
		std	2,x
		ldd	#$200
		std	4,x
		ldd	2,x
		subd	MReg4D
		sta	6,x
		bpl	loc_A76B
		coma
		negb
		sbca	#$FF

loc_A76B:
		std	DVDDH
		ldd	,x
		subd	MReg4C
		std	DVSRH
		ldd	#$200
		std	DVDDH
		lda	MW0
		asla
		asla
		bcc	loc_A784
		clra

loc_A784:
		sta	7,x
		lda	<DPbyte_7D	; Joystick X
		eora	6,x
		bpl	loc_A790
		clr	6,x
		bra	loc_A7B2
; ---------------------------------------------------------------------------

loc_A790:				; Joystick X
		lda	<DPbyte_7D
		bpl	loc_A795
		nega

loc_A795:
		asla
		cmpa	7,x
		bhi	loc_A79E
		clr	6,x
		bra	loc_A7B2
; ---------------------------------------------------------------------------

loc_A79E:
		lda	#$FF
		sta	6,x
		ldx	<DPbyte_1
		lda	4,x
		cmpa	#8
		bne	loc_A7AE
		lda	#7
		bra	loc_A7B0
; ---------------------------------------------------------------------------

loc_A7AE:
		lda	#8

loc_A7B0:
		sta	4,x

loc_A7B2:
		jsr	Sound_39
		rts
; END OF FUNCTION CHUNK	FOR sub_A591

; =============== S U B	R O U T	I N E =======================================

; Emit fireballs from towers/bunkers

sub_A7B6:

; FUNCTION CHUNK AT A7D1 SIZE 0000000E BYTES

		jsr	sub_A705	; Emit fireballs from towers 3
		lda	#3
		sta	4,x
		bra	loc_A7D1
; End of function sub_A7B6


; =============== S U B	R O U T	I N E =======================================


sub_A7BF:
		jsr	sub_A705	; Emit fireballs from towers 3
		lda	#4
		sta	4,x
		bra	loc_A7D1
; End of function sub_A7BF


; =============== S U B	R O U T	I N E =======================================

; Emit fireballs from towers/bunkers 2

sub_A7C8:
		jsr	sub_A705	; Emit fireballs from towers 3
		lda	#5
		sta	4,x
		bra	*+2
; End of function sub_A7C8

; START	OF FUNCTION CHUNK FOR sub_A7B6

loc_A7D1:
		lda	#$70 ; 'p'
		sta	5,x
		lda	#5
		sta	3,x
		ldu	<DPbyte_64	; Pointer to Tie fighter data
		ldx	,x
		lda	,u
; END OF FUNCTION CHUNK	FOR sub_A7B6

; =============== S U B	R O U T	I N E =======================================


sub_A7DF:
		suba	MReg4C
		anda	#$80 ; 'Ä'
		eora	,u
		ldb	1,u
		std	,x
		ldd	2,u
		std	2,x
		ldd	MReg22		; ZT2
		std	4,x
		jsr	Sound_39
		rts
; End of function sub_A7DF


; =============== S U B	R O U T	I N E =======================================


sub_A7F7:
		lda	<DPbyte_95
		beq	loc_A800
		jsr	sub_A705	; Emit fireballs from towers 3
		bra	loc_A803
; ---------------------------------------------------------------------------

loc_A800:
		jsr	sub_A6F4

loc_A803:
		lda	#9
		sta	4,x
		ldu	,x
		bra	loc_A81F
; End of function sub_A7F7


; =============== S U B	R O U T	I N E =======================================


sub_A80B:
		lda	<DPbyte_95
		beq	loc_A814
		jsr	sub_A705	; Emit fireballs from towers 3
		bra	loc_A817
; ---------------------------------------------------------------------------

loc_A814:
		jsr	sub_A6F4

loc_A817:
		lda	#$A
		sta	4,x
		ldu	,x
		bra	*+2

loc_A81F:
		ldd	MReg3C
		std	,u
		ldd	MReg3D
		std	2,u
		ldd	MReg3E
		std	4,u
		lda	#$40 ; '@'
		sta	5,x
		lda	#5
		sta	3,x
		lda	PRNG
		lsra
		ldb	MReg3E
		cmpb	#$FC ; '¸'
		blt	loc_A843
		lda	#0

loc_A843:
		sta	6,u
		jsr	Sound_39
		rts
; End of function sub_A80B


; =============== S U B	R O U T	I N E =======================================

; Fireball movement

sub_A849:
		ldx	#byte_494B	; 6x Fireball data structure 2 ($6 bytes per fireball)

loc_A84C:				; Fireball data	pointer
		stx	<DPbyte_A8
		lda	3,x
		beq	loc_A861
		ldb	4,x
		aslb
		cmpb	#$16
		bcc	loc_A860
		ldu	#JumpTableA675
		jsr	[b,u]		; Fireball movement processing
		bra	loc_A861
; ---------------------------------------------------------------------------

loc_A860:
		swi

loc_A861:				; Fireball data	pointer
		ldx	<DPbyte_A8
		leax	6,x
		cmpx	#byte_494B+$24	; 6x Fireball data structure 2 ($6 bytes per fireball)
		bcs	loc_A84C
		rts
; End of function sub_A849


; =============== S U B	R O U T	I N E =======================================


sub_A86B:
		dec	5,x
		bgt	locret_A874
		clrb
		stb	3,x
		stb	5,x

locret_A874:
		rts
; End of function sub_A86B


; =============== S U B	R O U T	I N E =======================================


sub_A875:
		dec	5,x
		bgt	loc_A880
		clrb
		stb	3,x
		stb	5,x
		bra	locret_A8A6
; ---------------------------------------------------------------------------

loc_A880:
		ldu	,x
		ldd	#0
		subd	,u
		jsr	Shift_D_R_3
		addd	,u
		std	,u
		ldd	#0
		subd	2,u
		jsr	Shift_D_R_3
		addd	2,u
		std	2,u
		ldd	#0
		subd	4,u
		jsr	Shift_D_R_3
		addd	4,u
		std	4,u

locret_A8A6:
		rts
; End of function sub_A875


; =============== S U B	R O U T	I N E =======================================


sub_A8A7:
		dec	5,x
		bgt	loc_A8B2
		clrb
		stb	3,x
		stb	5,x
		bra	locret_A8D5
; ---------------------------------------------------------------------------

loc_A8B2:
		ldu	,x
		ldd	,u
		jsr	Shift_D_R_3
		addd	,u
		bvs	loc_A8D6
		std	,u
		ldd	2,u
		jsr	Shift_D_R_3
		addd	2,u
		bvs	loc_A8D6
		std	2,u
		ldd	4,u
		jsr	Shift_D_R_3
		addd	4,u
		bvs	loc_A8D6
		std	4,u

locret_A8D5:
		rts
; ---------------------------------------------------------------------------

loc_A8D6:
		clrb
		stb	3,x
		rts
; End of function sub_A8A7


; =============== S U B	R O U T	I N E =======================================

; Some towers processing

sub_A8DA:
		ldu	,x
		ldd	#$FF00
		addd	,u
		std	,u
		jmp	loc_AA7D
; ---------------------------------------------------------------------------

loc_A8E6:
		ldu	,x
		ldd	#$FF00
		addd	,u
		std	,u
		ldd	#$FF00
		addd	2,u
		std	2,u
		jmp	loc_AA7D
; ---------------------------------------------------------------------------

loc_A8F9:
		ldu	,x
		ldd	#$FF00
		addd	,u
		std	,u
		ldd	#$100
		addd	2,u
		std	2,u
		jmp	loc_AA7D
; ---------------------------------------------------------------------------

loc_A90C:
		ldb	,u
		subb	MReg4C
		bmi	locret_A91F
		clra
		jsr	Shift_D_L_2
		coma
		negb
		sbca	#$FF
		addd	,u
		std	,u

locret_A91F:
		rts
; ---------------------------------------------------------------------------

loc_A920:
		ldd	#0
		subd	MReg47
		jsr	Shift_D_R_3
		addd	MReg47
		bpl	locret_A932
		addd	2,u
		std	2,u

locret_A932:
		rts
; ---------------------------------------------------------------------------

loc_A933:
		ldd	#0
		subd	MReg47
		jsr	Shift_D_R_3
		addd	MReg47
		bmi	locret_A945
		addd	2,u
		std	2,u

locret_A945:
		rts
; ---------------------------------------------------------------------------

loc_A946:
		ldu	,x
		jsr	loc_A933
		jsr	loc_A90C
		ldd	,u
		subd	MReg4C
		ldb	7,u
		mul
		tst	6,u
		bne	loc_A95E
		coma
		negb
		sbca	#$FF

loc_A95E:
		addd	MReg4D
		subd	2,u
		addd	#$100
		bmi	loc_A978
		jsr	Shift_D_R_3
		cmpd	#$180
		ble	loc_A974
		ldd	#$180

loc_A974:
		addd	2,u
		bra	loc_A986
; ---------------------------------------------------------------------------

loc_A978:				; Shift	D register right
		jsr	Shift_D_R_5
		cmpd	#$FE80
		bge	loc_A984
		ldd	#$FE80

loc_A984:
		addd	2,u

loc_A986:
		std	2,u
		ldd	MReg4E
		addd	#$100
		subd	4,u
		bmi	locret_A9A2
		jsr	Shift_D_R_3
		cmpd	#$200
		ble	loc_A99E
		ldd	#$200

loc_A99E:
		addd	4,u
		std	4,u

locret_A9A2:
		rts
; ---------------------------------------------------------------------------

loc_A9A3:
		ldu	,x
		jsr	loc_A920
		jsr	loc_A90C
		ldd	,u
		subd	MReg4C
		ldb	7,u
		mul
		tst	6,u
		beq	loc_A9BB
		coma
		negb
		sbca	#$FF

loc_A9BB:
		addd	MReg4D
		addd	#$FF00
		subd	2,u
		bmi	loc_A9D5
		jsr	Shift_D_R_5	; Shift	D register right
		cmpd	#$180
		ble	loc_A9D1
		ldd	#$180

loc_A9D1:
		addd	2,u
		bra	loc_A9E3
; ---------------------------------------------------------------------------

loc_A9D5:
		jsr	Shift_D_R_3
		cmpd	#$FE80
		bge	loc_A9E1
		ldd	#$FE80

loc_A9E1:
		addd	2,u

loc_A9E3:
		std	2,u
		ldd	MReg4E
		addd	#$100
		subd	4,u
		bmi	locret_A9FF
		jsr	Shift_D_R_3
		cmpd	#$200
		ble	loc_A9FB
		ldd	#$200

loc_A9FB:
		addd	4,u
		std	4,u

locret_A9FF:
		rts
; ---------------------------------------------------------------------------

loc_AA00:
		ldu	,x
		ldd	#$FF00
		addd	,u
		std	,u
		ldd	MReg4E
		addd	#$80 ; 'Ä'
		subd	4,u
		bmi	loc_AA23
		jsr	Shift_D_R_3
		cmpd	#$180
		ble	loc_AA1F
		ldd	#$180

loc_AA1F:
		addd	4,u
		std	4,u

loc_AA23:
		bra	loc_AA7D
; ---------------------------------------------------------------------------
		fcb $EE, $84, $CC, $FF,	0, $E3,	$C4, $ED
		fcb $C4, $CC, $FF, 0, $E3, $42,	$ED, $42
		fcb $FC, $50, $9C, $C3,	0, $80,	$A3, $44
		fcb $2B, $10, $BD, $CD,	$A2, $10, $83, 1
		fcb $80, $2F, 3, $CC, 1, $80, $E3, $44
		fcb $ED, $44, $20, $2C,	$EE, $84, $CC, $FF
		fcb 0, $E3, $C4, $ED, $C4, $CC,	1, 0
		fcb $E3, $42, $ED, $42,	$FC, $50, $9C, $C3
		fcb 0, $80, $A3, $44, $2B, $10,	$BD, $CD
		fcb $A2, $10, $83, 1, $80, $2F,	3, $CC
		fcb 1, $80, $E3, $44, $ED, $44,	$20, 0
; ---------------------------------------------------------------------------

loc_AA7D:
		lda	3,x
		bita	#2
		beq	locret_AA85
		clr	3,x

locret_AA85:
		rts
; End of function sub_A8DA


; =============== S U B	R O U T	I N E =======================================

; Exhaust port processing

sub_AA86:
		ldu	,x
		jsr	loc_A90C
		ldd	MReg4E
		subd	4,u
		bmi	loc_AA99
		jsr	Shift_D_R_4
		addd	4,u
		std	4,u

loc_AA99:
		lda	byte_4B19
		cmpa	#1
		bcs	loc_AAA5
		ldd	MReg4D
		bra	loc_AAA8
; ---------------------------------------------------------------------------

loc_AAA5:
		ldd	#$FE80

loc_AAA8:
		subd	2,u
		bmi	loc_AAB3
		jsr	Shift_D_R_4
		addd	2,u
		std	2,u

loc_AAB3:
		bra	loc_AA7D
; End of function sub_AA86


; =============== S U B	R O U T	I N E =======================================


sub_AAB5:
		ldu	,x
		jsr	loc_A90C
		ldd	MReg4E
		subd	4,u
		bmi	loc_AAC8
		jsr	Shift_D_R_4
		addd	4,u
		std	4,u

loc_AAC8:
		lda	byte_4B19
		cmpa	#1
		bcs	loc_AAD4
		ldd	MReg4D
		bra	loc_AAD7
; ---------------------------------------------------------------------------

loc_AAD4:
		ldd	#$180

loc_AAD7:
		subd	2,u
		bpl	loc_AAE2
		jsr	Shift_D_R_4
		addd	2,u
		std	2,u

loc_AAE2:
		bra	loc_AA7D
; End of function sub_AAB5


; =============== S U B	R O U T	I N E =======================================

; Fireball processing

sub_AAE4:
		ldx	#byte_494B	; 6x Fireball data structure 2 ($6 bytes per fireball)

loc_AAE7:				; Fireball data	pointer
		stx	<DPbyte_A8
		lda	3,x
		lbeq	loc_AC34
		bita	#$10
		beq	loc_AAF9
		jsr	sub_ACB1	; Shield lost by fireball animation
		jmp	loc_AC34
; ---------------------------------------------------------------------------

loc_AAF9:
		bita	#4
		beq	loc_AB11
		ldd	MReg4C
		std	MReg20		; XT2
		ldd	MReg4D
		std	MReg21		; YT2
		ldd	MReg4E
		std	MReg22		; ZT2
		bra	loc_AB1D
; ---------------------------------------------------------------------------

loc_AB11:
		ldd	#0
		std	MReg20		; XT2
		std	MReg21		; YT2
		std	MReg22		; ZT2

loc_AB1D:
		clra
		ldb	2,x
		std	MW1
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg00		; Math result X
		cmpd	#1
		lble	loc_AC27
		cmpd	#$7F00
		lbhi	loc_AC27
		std	DVSRH
		std	MReg0C		; XT
		ldd	MReg01		; Math result Y
		std	MReg0D		; YT
		bpl	loc_AB4D
		coma
		negb
		sbca	#$FF

loc_AB4D:				; Math result X
		subd	MReg00
		lbcc	loc_AC27
		ldd	MReg02		; Math result Z
		std	MReg0E		; ZT
		bpl	loc_AB60
		coma
		negb
		sbca	#$FF

loc_AB60:				; Math result X
		subd	MReg00
		lbcc	loc_AC27
		jsr	sub_CCF0	; Get divider result and multiply by Math result Z, insert VCTR	instruction
		ldx	<DPbyte_A8	; Fireball data	pointer
		lda	3,x
		bita	#3
		beq	loc_ABC0
		ldd	#$80 ; 'Ä'
		std	MReg01		; Math result Y
		lda	#$86 ; 'Ü'      ; Reg01 = Reg01 x Reg00
					; Reg02	= Reg02	x Reg00
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg01		; Math result Y
		addd	#$A
		std	<DPbyte_3
		ldd	<DPbyte_D6
		subd	<DPbyte_B3
		bpl	loc_AB8F
		coma
		negb
		sbca	#$FF

loc_AB8F:
		std	<DPbyte_1
		subd	<DPbyte_3
		bgt	loc_ABC0
		ldd	<DPbyte_D8
		subd	<DPbyte_B5
		bpl	loc_AB9F
		coma
		negb
		sbca	#$FF

loc_AB9F:
		cmpd	<DPbyte_3
		bgt	loc_ABC0
		addd	<DPbyte_1
		std	<DPbyte_1
		ldd	<DPbyte_3
		lsra
		rorb
		addd	<DPbyte_3
		subd	<DPbyte_1
		blt	loc_ABC0
		ldd	MReg0C		; XT
		cmpd	<DPbyte_CC
		bcc	loc_ABC0
		std	<DPbyte_CC
		ldx	<DPbyte_A8	; Fireball data	pointer
		stx	<DPbyte_CA

loc_ABC0:
		lda	3,x
		bita	#1
		beq	loc_AC22
		ldd	MReg0C		; XT
		aslb
		rola
		bmi	loc_AC22
		ldu	MReg43
		cmpu	#$200
		blt	loc_ABDB
		subd	MReg43
		bra	loc_ABDE
; ---------------------------------------------------------------------------

loc_ABDB:
		subd	#$200

loc_ABDE:
		ble	loc_ABE5
		subd	#$110
		bgt	loc_AC22

loc_ABE5:
		ldd	<DPbyte_D6
		bmi	loc_ABF0
		subd	#$1C0
		bge	loc_AC22
		bra	loc_ABF5
; ---------------------------------------------------------------------------

loc_ABF0:
		subd	#$FE40
		ble	loc_AC22

loc_ABF5:
		ldd	<DPbyte_D8
		bmi	loc_AC00
		subd	#$1E0
		bge	loc_AC22
		bra	loc_AC05
; ---------------------------------------------------------------------------

loc_AC00:
		subd	#$FE60
		ble	loc_AC22

loc_AC05:
		cmpx	<DPbyte_CA
		bne	loc_AC14
		lda	<DPbyte_BC
		beq	loc_AC14
		jsr	sub_AD20	; Fireball destroyed
		ldx	<DPbyte_A8	; Fireball data	pointer
		bra	loc_AC22
; ---------------------------------------------------------------------------

loc_AC14:				; Shield lost by fireball hit
		jsr	sub_ACE0
		ldd	#$8040
		std	,y++
		jsr	sub_ACB1	; Shield lost by fireball animation
		jmp	loc_AC34
; ---------------------------------------------------------------------------

loc_AC22:				; Fireball animation
		jsr	sub_AC52
		bra	loc_AC34
; ---------------------------------------------------------------------------

loc_AC27:
		lda	3,x
		bita	#1
		beq	loc_AC31
		lda	#0
		bra	loc_AC32
; ---------------------------------------------------------------------------

loc_AC31:
		clra

loc_AC32:
		sta	3,x

loc_AC34:				; Fireball data	pointer
		ldx	<DPbyte_A8
		leax	6,x
		cmpx	#byte_494B+$24	; Check	for all	6 fireball slots
		lbcs	loc_AAE7
		ldd	MReg4C
		std	MReg20		; XT2
		ldd	MReg4D
		std	MReg21		; YT2
		ldd	MReg4E
		std	MReg22		; ZT2
		rts
; End of function sub_AAE4


; =============== S U B	R O U T	I N E =======================================

; Fireball animation

sub_AC52:
		ldx	<DPbyte_A8	; Fireball data	pointer
		lda	#8
		sta	<DPbyte_1
		ldd	MReg0C		; XT

loc_AC5B:
		dec	<DPbyte_1
		beq	loc_AC65
		aslb
		rola
		bpl	loc_AC5B
		anda	#$7F ; ''

loc_AC65:
		sta	<DPbyte_2
		lda	3,x
		anda	#$20 ; ' '
		bne	loc_AC7C
		lda	<DPbyte_1
		ora	#$70 ; 'p'
		ldb	<DPbyte_2
		std	,y++
		ldd	#$A015
		std	,y++
		bra	loc_ACA6
; ---------------------------------------------------------------------------

loc_AC7C:
		ldb	<DPbyte_2
		lda	<DPbyte_1
		inca
		cmpa	#3
		bcc	loc_AC8A
		lda	#3
		clrb
		bra	loc_AC91
; ---------------------------------------------------------------------------

loc_AC8A:
		cmpa	#6
		bcs	loc_AC91
		lda	#6
		clrb

loc_AC91:
		ora	#$70 ; 'p'
		std	,y++
		ldb	5,x
		aslb
		aslb
		aslb
		aslb
		orb	#$F
		lda	#$65 ; 'e'
		std	,y++
		ldd	#$A017
		std	,y++

loc_ACA6:
		ldd	#$7200
		std	,y++
		ldd	#$8040
		std	,y++
		rts
; End of function sub_AC52


; =============== S U B	R O U T	I N E =======================================

; Shield lost by fireball animation

sub_ACB1:
		ldx	<DPbyte_A8	; Fireball data	pointer
		ldu	,x
		ldd	,u
		std	,y++
		ldd	2,u
		std	,y++
		lda	5,x
		ldb	#$10
		mul
		lda	#$70 ; 'p'
		std	,y++
		ldb	5,x
		aslb
		aslb
		aslb
		aslb
		lda	#$67 ; 'g'
		std	,y++
		ldd	#$A017
		std	,y++
		ldd	#$7200
		std	,y++
		ldd	#$8040
		std	,y++
		rts
; End of function sub_ACB1


; =============== S U B	R O U T	I N E =======================================

; Shield lost by fireball hit

sub_ACE0:
		ldu	,x
		ldd	-4,y
		std	,u
		ldd	-2,y
		std	2,u
		lda	#$10
		sta	3,x
		lda	#$F
		sta	5,x
		lda	#0
		sta	4,x
		jsr	sub_9874
		lda	<DPbyte_63
		bne	loc_AD00
		lda	PRNG

loc_AD00:
		ldb	#$20 ; ' '
		tsta
		bpl	loc_AD06
		negb

loc_AD06:
		stb	<DPbyte_63
		jsr	Sound_33
		lda	byte_4B37
		bne	locret_AD1F
		inc	byte_4B37
		lda	<DPbyte_60	; Shield count
		cmpa	#3
		bls	locret_AD1F
		jsr	Sound_9
		jsr	Sound_31

locret_AD1F:
		rts
; End of function sub_ACE0


; =============== S U B	R O U T	I N E =======================================

; Fireball destroyed

sub_AD20:
		ldu	<DPbyte_CA
		lda	3,u
		beq	locret_AD3D
		anda	#4
		ora	#$20 ; ' '
		sta	3,u
		lda	#$F
		sta	5,u
		lda	#0
		sta	4,u
		jsr	Sound_37
		jsr	sub_9801	; Fireball score
		jsr	Sound_34

locret_AD3D:
		rts
; End of function sub_AD20


; =============== S U B	R O U T	I N E =======================================


sub_AD3E:
		lda	#1
		sta	<DPbyte_45
		ldd	MReg4C
		addd	#$100
		std	<DPbyte_46
		ldd	MReg4D
		std	<DPbyte_48
		ldd	MReg4E
		std	<DPbyte_4A
		ldx	#byte_494B	; 6x Fireball data structure 2 ($6 bytes per fireball)

loc_AD57:
		stx	<DPbyte_CA
		jsr	sub_AD20	; Fireball destroyed
		ldx	<DPbyte_CA
		leax	6,x
		cmpx	#byte_494B+$24	; 6x Fireball data structure 2 ($6 bytes per fireball)
		bcs	loc_AD57
		jsr	Sound_23
		jsr	Sound_2D
		rts
; End of function sub_AD3E


; =============== S U B	R O U T	I N E =======================================


sub_AD6C:
		lda	<DPbyte_45
		beq	locret_ADAE
		ldd	<DPbyte_46
		addd	#$300
		addd	MReg43
		cmpd	<DPbyte_96
		bmi	loc_AD7F
		ldd	<DPbyte_96

loc_AD7F:
		std	<DPbyte_46
		ldd	<DPbyte_96
		subd	<DPbyte_46
		subd	#$1000
		cmpd	<DPbyte_4A
		bge	loc_AD8F
		std	<DPbyte_4A

loc_AD8F:
		ldd	<DPbyte_96
		subd	<DPbyte_46
		jsr	Shift_D_R_4
		tst	<DPbyte_48
		bmi	loc_ADA3
		cmpd	<DPbyte_48
		bge	loc_ADA1
		std	<DPbyte_48

loc_ADA1:
		bra	locret_ADAE
; ---------------------------------------------------------------------------

loc_ADA3:
		coma
		negb
		sbca	#$FF
		cmpd	<DPbyte_48
		ble	locret_ADAE
		std	<DPbyte_48

locret_ADAE:
		rts
; End of function sub_AD6C


; =============== S U B	R O U T	I N E =======================================


sub_ADAF:
		lda	<DPbyte_45
		beq	locret_ADD3
		ldd	<DPbyte_46
		std	MReg3C
		ldd	<DPbyte_48
		addd	#$80 ; 'Ä'
; End of function sub_ADAF


; =============== S U B	R O U T	I N E =======================================


sub_ADBD:
		std	MReg3D
		ldd	<DPbyte_4A
		std	MReg3E
		jsr	sub_ADD4
		ldd	<DPbyte_48
		subd	#$80 ; 'Ä'
		std	MReg3D
		jsr	sub_ADD4

locret_ADD3:
		rts
; End of function sub_ADBD


; =============== S U B	R O U T	I N E =======================================


sub_ADD4:
		ldd	#$F		; Point	BIC to $5078 MReg3C
		std	MW1
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg00		; Math result X
		subd	#$E000
		bgt	loc_ADEB
		lda	#0
		sta	<DPbyte_45

loc_ADEB:				; Math result X
		ldd	MReg00
		cmpd	#1
		blt	locret_AE5F
		std	DVSRH
		std	MReg0C		; XT
		ldd	MReg01		; Math result Y
		bpl	loc_AE03
		coma
		negb
		sbca	#$FF

loc_AE03:				; Math result X
		subd	MReg00
		bge	locret_AE5F
		ldd	MReg02		; Math result Z
		bpl	loc_AE11
		coma
		negb
		sbca	#$FF

loc_AE11:				; Math result X
		subd	MReg00
		bge	locret_AE5F
		ldd	MW0
		std	MReg00		; Math result X
		lda	#$86 ; 'Ü'      ; Reg01 = Reg01 x Reg00
					; Reg02	= Reg02	x Reg00
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg02		; Math result Z
		addd	#$FF98
		anda	#$1F
		std	,y++
		ldd	MReg01		; Math result Y
		anda	#$1F
		std	,y++
		ldd	#$63FF
		std	,y++
		lda	#6
		sta	<DPbyte_1
		ldd	MReg0C		; XT

loc_AE3E:
		dec	<DPbyte_1
		beq	loc_AE48
		aslb
		rola
		bpl	loc_AE3E
		anda	#$7F ; ''

loc_AE48:
		ldb	<DPbyte_1
		orb	#$70 ; 'p'
		stb	,y+
		sta	,y+
		ldd	#$A016
		std	,y++
		ldd	#$7200
		std	,y++
		ldd	#$8040
		std	,y++

locret_AE5F:
		rts
; End of function sub_ADD4


; =============== S U B	R O U T	I N E =======================================


sub_AE60:
		lda	<DPbyte_BD
		ble	loc_AE6E
		dec	<DPbyte_BD
		lda	#0
		sta	<DPbyte_B7
		sta	<DPbyte_BC
		bra	loc_AE72
; ---------------------------------------------------------------------------

loc_AE6E:
		lda	#0
		sta	<DPbyte_BD

loc_AE72:
		lda	#0
		sta	<DPbyte_BC
		orcc	#$10
		lda	<DPbyte_31
		beq	loc_AE87
		inc	byte_4B1B
		clr	<DPbyte_BD
		ldb	#8
		stb	<DPbyte_B7
		clr	<DPbyte_31

loc_AE87:
		lda	<DPbyte_B7
		ble	loc_AE9F
		dec	<DPbyte_B7
		sta	<DPbyte_BC
		ldd	<DPbyte_74
		std	<DPbyte_B8
		ldd	<DPbyte_6B
		std	<DPbyte_BA
		ldd	<DPbyte_2D
		std	<DPbyte_B3
		ldd	<DPbyte_2F
		std	<DPbyte_B5

loc_AE9F:
		andcc	#$EF ; 'Ô'
		lda	<DPbyte_B7
		cmpa	#7
		bne	loc_AEB2
		lda	byte_4B36
		bne	loc_AEAF
		dec	byte_4B36

loc_AEAF:
		jsr	Sound_3A

loc_AEB2:
		lda	#$FF
		sta	<DPbyte_C4
		sta	<DPbyte_C8
		sta	<DPbyte_CC
		sta	<DPbyte_D0
		rts
; End of function sub_AE60


; =============== S U B	R O U T	I N E =======================================


sub_AEBD:
		lda	<DPbyte_BC
		ora	<DPbyte_BD
		bne	loc_AEC4
		rts
; ---------------------------------------------------------------------------

loc_AEC4:
		lda	byte_4B1B
		anda	#1
		beq	loc_AF25
		ldd	#$FF98
		addd	word_4B1E
		anda	#$1F
		std	,y++
		ldd	<DPbyte_B5
		subd	#0
		subd	word_4B1E
		std	<DPbyte_3
		ldd	#$FE7A
		addd	word_4B1C
		anda	#$1F
		std	,y++
		ldd	<DPbyte_B3
		subd	#$FE7A
		subd	word_4B1C
		std	<DPbyte_1
		ldb	#0
		jsr	sub_AF87
		ldd	#$FDFB
		addd	word_4B1E
		anda	#$1F
		std	,y++
		ldd	<DPbyte_B5
		subd	#$FE63
		subd	word_4B1E
		std	<DPbyte_3
		ldd	#$FE75
		addd	word_4B1C
		anda	#$1F
		std	,y++
		ldd	<DPbyte_B3
		subd	#$FE75
		subd	word_4B1C
		std	<DPbyte_1
		ldb	#8
		jsr	sub_AF87

loc_AF25:
		lda	byte_4B1B
		anda	#1
		bne	locret_AF86
		ldd	#$FDFB
		addd	word_4B1E
		anda	#$1F
		std	,y++
		ldd	<DPbyte_B5
		subd	#$FE63
		subd	word_4B1E
		std	<DPbyte_3
		ldd	#$18B
		addd	word_4B1C
		anda	#$1F
		std	,y++
		ldd	<DPbyte_B3
		subd	#$18B
		subd	word_4B1C
		std	<DPbyte_1
		ldb	#0
		jsr	sub_AF87
		ldd	#$FF98
		addd	word_4B1E
		anda	#$1F
		std	,y++
		ldd	<DPbyte_B5
		subd	#0
		subd	word_4B1E
		std	<DPbyte_3
		ldd	#$186
		addd	word_4B1C
		anda	#$1F
		std	,y++
		ldd	<DPbyte_B3
		subd	#$186
		subd	word_4B1C
		std	<DPbyte_1
		ldb	#8
		jsr	sub_AF87

locret_AF86:
		rts
; End of function sub_AEBD


; =============== S U B	R O U T	I N E =======================================


sub_AF87:
		ldu	#tbl0xB04F
		leau	b,u
		lda	<DPbyte_BD
		ble	loc_AF9A
		ldb	#$3F ; '?'
		mul
		lda	#$63 ; 'c'
		std	,y++
		jmp	loc_AFEF
; ---------------------------------------------------------------------------

loc_AF9A:
		ldx	#Scratch_RAM_start

loc_AF9D:
		ldd	,u++
		std	,y++
		ldd	<DPbyte_3
		bmi	loc_AFA8
		addd	#1

loc_AFA8:
		asra
		rorb
		std	,y
		coma
		negb
		sbca	#$FF
		addd	<DPbyte_3
		std	<DPbyte_3
		ldd	,y
		anda	#$1F
		std	,y++
		ldd	<DPbyte_1
		bmi	loc_AFC1
		addd	#1

loc_AFC1:
		asra
		rorb
		std	,y
		coma
		negb
		sbca	#$FF
		addd	<DPbyte_1
		std	<DPbyte_1
		ldd	,y
		ora	#$E0 ; '‡'
		std	,y++
		ldd	<DPbyte_1
		addd	#8
		blt	loc_AF9D
		subd	#$10
		bgt	loc_AF9D
		ldd	<DPbyte_3
		addd	#8
		blt	loc_AF9D
		subd	#$10
		bgt	loc_AF9D
		ldd	,u++
		std	,y++

loc_AFEF:
		ldd	<DPbyte_3
		anda	#$1F
		std	,y++
		ldd	<DPbyte_1
		ora	#$E0 ; '‡'
		std	,y++
		lda	<DPbyte_BD
		ble	loc_B006
		ldd	#$A011
		std	,y++
		bra	loc_B044
; ---------------------------------------------------------------------------

loc_B006:
		bge	loc_B044
		ldb	byte_4B22
		lda	#$71 ; 'q'
		std	,y++
		ldd	word_4B20
		std	,y++
		lda	byte_4B23
		anda	#1
		beq	loc_B020
		ldd	#$A01C
		std	,y++

loc_B020:
		lda	byte_4B23
		anda	#2
		beq	loc_B02C
		ldd	#$A023
		std	,y++

loc_B02C:
		lda	byte_4B23
		anda	#4
		beq	loc_B038
		ldd	#$A02A
		std	,y++

loc_B038:
		lda	byte_4B23
		anda	#8
		beq	loc_B044
		ldd	#$A031
		std	,y++

loc_B044:
		ldd	#$7200
		std	,y++
		ldd	#$8040
		std	,y++
		rts
; End of function sub_AF87

; ---------------------------------------------------------------------------
tbl0xB04F:	fdb $A001		; Laser	vector animation
		fdb $A002
		fdb $A003
		fdb $A004
		fdb $A005
		fdb $A006
		fdb $A007
		fdb $A008
		fdb $A009
		fdb $A00A
		fdb $A00B
		fdb $A00C
		fdb $A00D
		fdb $A00E
		fdb $A00F
		fdb $A010
		fdb $A001

; =============== S U B	R O U T	I N E =======================================


sub_B071:
		lda	<DPbyte_BC
		beq	locret_B094
		jsr	sub_B095
		ldd	#$200
		std	DVDDH
		ldd	<DPbyte_CC
		bmi	loc_B089
		lda	#4
		sta	<DPbyte_BD
		jsr	sub_AD20	; Fireball destroyed

loc_B089:
		lda	<DPbyte_44
		ble	locret_B094
		lda	#$FF
		sta	<DPbyte_44
		jsr	sub_AD3E

locret_B094:
		rts
; End of function sub_B071


; =============== S U B	R O U T	I N E =======================================


sub_B095:
		ldd	#$7000
		addd	MReg20		; XT2
		std	<DPbyte_1
		ldd	#0
		subd	<DPbyte_B8
		jsr	Shift_D_R_3
		addd	<DPbyte_B8
		addd	MReg21		; YT2
		std	<DPbyte_3
		ldd	#0
		subd	<DPbyte_BA
		jsr	Shift_D_R_3
		addd	<DPbyte_BA
		addd	MReg22		; ZT2
		std	<DPbyte_5
		ldd	#$F000
		subd	<DPbyte_5
		lblt	loc_B158
		std	DVDDH
		ldd	MReg22		; ZT2
		subd	<DPbyte_5
		std	DVSRH
		ldd	<DPbyte_3
		subd	MReg21		; YT2
		std	MReg01		; Math result Y
		ldd	<DPbyte_1
		subd	MReg20		; XT2
		std	MReg02		; Math result Z
		ldd	MW0
		std	MReg00		; Math result X
		lda	#$86 ; 'Ü'      ; Reg01 = Reg01 x Reg00
					; Reg02	= Reg02	x Reg00
		jsr	Math_Run_Start	; Do math program run
		ldd	<DPbyte_3
		subd	MReg01		; Math result Y
		bmi	loc_B0F9
		cmpd	#$400
		bgt	loc_B158
		bra	loc_B0FF
; ---------------------------------------------------------------------------

loc_B0F9:
		cmpd	#$FC00
		blt	loc_B158

loc_B0FF:
		std	<DPbyte_3
		ldd	<DPbyte_1
		subd	MReg02		; Math result Z
		std	<DPbyte_1
		std	<DPbyte_C0
		ldd	#$F000
		std	<DPbyte_5
		lda	#$FF
		sta	<DPbyte_BD
		lda	#3
		sta	byte_4B23
		lda	<DPbyte_1
		suba	MReg20		; XT2
		ldb	#3
		mul
		cmpd	#$E0 ; '‡'
		bcs	loc_B128
		ldb	#$E0 ; '‡'

loc_B128:
		stb	byte_4B22
		ldd	#$6280
		std	word_4B20
		lda	<DPbyte_95
		beq	locret_B157
		lda	<DPbyte_44
		bne	locret_B157
		ldd	<DPbyte_3
		addd	#$200
		blt	locret_B157
		subd	#$400
		bgt	locret_B157
		ldd	<DPbyte_1
		subd	<DPbyte_96
		addd	#$200
		blt	locret_B157
		subd	#$400
		bgt	locret_B157
		lda	#1
		sta	<DPbyte_44

locret_B157:
		rts
; ---------------------------------------------------------------------------

loc_B158:
		ldd	<DPbyte_3
		lbpl	loc_B1E3
		ldd	#$FC00
		subd	<DPbyte_3
		lblt	locret_B260
		std	DVDDH
		ldd	MReg21		; YT2
		subd	<DPbyte_3
		std	DVSRH
		ldd	<DPbyte_5
		subd	MReg22		; ZT2
		std	MReg02		; Math result Z
		ldd	<DPbyte_1
		subd	MReg20		; XT2
		std	MReg01		; Math result Y
		ldd	MW0
		std	MReg00		; Math result X
		lda	#$86 ; 'Ü'      ; Reg01 = Reg01 x Reg00
					; Reg02	= Reg02	x Reg00
		jsr	Math_Run_Start	; Do math program run
		ldd	<DPbyte_5
		subd	MReg02		; Math result Z
		bmi	loc_B19E
		cmpd	#0
		lbgt	locret_B260
		bra	loc_B1A6
; ---------------------------------------------------------------------------

loc_B19E:
		cmpd	#$F000
		lblt	locret_B260

loc_B1A6:
		std	<DPbyte_5
		addd	#$1000
		std	<DPbyte_BE
		ldd	<DPbyte_1
		subd	MReg01		; Math result Y
		std	<DPbyte_1
		std	<DPbyte_C0
		ldd	#$FC00
		std	<DPbyte_3
		lda	#$FF
		sta	<DPbyte_BD
		lda	#9
		sta	byte_4B23
		lda	<DPbyte_1
		suba	MReg20		; XT2
		ldb	#3
		mul
		cmpd	#$E0 ; '‡'
		bcs	loc_B1D4
		ldb	#$E0 ; '‡'

loc_B1D4:
		stb	byte_4B22
		ldd	#$6280
		std	word_4B20
		ldx	#$4989
		jmp	loc_B261
; ---------------------------------------------------------------------------

loc_B1E3:
		subd	#$400
		blt	locret_B260
		std	DVDDH
		ldd	<DPbyte_3
		subd	MReg21		; YT2
		std	DVSRH
		ldd	<DPbyte_5
		subd	MReg22		; ZT2
		std	MReg02		; Math result Z
		ldd	<DPbyte_1
		subd	MReg20		; XT2
		std	MReg01		; Math result Y
		ldd	MW0
		std	MReg00		; Math result X
		lda	#$86 ; 'Ü'      ; Reg01 = Reg01 x Reg00
					; Reg02	= Reg02	x Reg00
		jsr	Math_Run_Start	; Do math program run
		ldd	<DPbyte_5
		subd	MReg02		; Math result Z
		bmi	loc_B21D
		cmpd	#0
		bgt	locret_B260
		bra	loc_B223
; ---------------------------------------------------------------------------

loc_B21D:
		cmpd	#$F000
		blt	locret_B260

loc_B223:
		std	<DPbyte_5
		addd	#$1000
		std	<DPbyte_BE
		ldd	<DPbyte_1
		subd	MReg01		; Math result Y
		std	<DPbyte_1
		std	<DPbyte_C0
		ldd	#$400
		std	<DPbyte_3
		lda	#$FF
		sta	<DPbyte_BD
		lda	#6
		sta	byte_4B23
		lda	<DPbyte_1
		suba	MReg20		; XT2
		ldb	#3
		mul
		cmpd	#$E0 ; '‡'
		bcs	loc_B251
		ldb	#$E0 ; '‡'

loc_B251:
		stb	byte_4B22
		ldd	#$6280
		std	word_4B20
		ldx	#$4999
		jmp	loc_B261
; ---------------------------------------------------------------------------

locret_B260:
		rts
; ---------------------------------------------------------------------------

loc_B261:
		lda	<DPbyte_BC
		bne	loc_B266
		rts
; ---------------------------------------------------------------------------

loc_B266:
		ldb	<DPbyte_C0
		lsrb
		lsrb
		lsrb
		andb	#$F
		abx
		ldd	<DPbyte_C0
		anda	#7
		subd	#$1C0
		blt	locret_B29B
		subd	#$480
		bgt	locret_B29B
		lda	#3
		sta	<DPbyte_1
		ldd	<DPbyte_BE
		subd	#$40 ; '@'

loc_B285:
		subd	#$380
		bgt	loc_B292
		subd	#$FC80
		blt	locret_B29B
		jmp	loc_B29C
; ---------------------------------------------------------------------------

loc_B292:
		subd	#$80 ; 'Ä'
		asl	<DPbyte_1
		asl	<DPbyte_1
		bne	loc_B285

locret_B29B:
		rts
; ---------------------------------------------------------------------------

loc_B29C:
		lda	<DPbyte_1
		anda	,x
		beq	locret_B2D1
		sta	<DPbyte_2
		lda	<DPbyte_1
		asla
		anda	<DPbyte_1
		cmpa	<DPbyte_2
		beq	locret_B2D1
		bls	loc_B2C1
		lda	#4
		sta	<DPbyte_BD
		lda	,x
		eora	<DPbyte_2
		sta	,x
		jsr	sub_97F2	; Trench green squares score
		jsr	Sound_35
		bra	locret_B2D1
; ---------------------------------------------------------------------------

loc_B2C1:
		lda	#4
		sta	<DPbyte_BD
		lda	,x
		eora	<DPbyte_2
		sta	,x
		jsr	sub_97FC	; Trench turrets score
		jsr	Sound_35

locret_B2D1:
		rts
; End of function sub_B095


; =============== S U B	R O U T	I N E =======================================


sub_B2D2:

; FUNCTION CHUNK AT A54B SIZE 00000045 BYTES

		lda	<DPbyte_BC
		beq	locret_B2E3
		ldd	<DPbyte_CC
		bmi	loc_B2E1
		lda	#4
		sta	<DPbyte_BD
		jsr	sub_AD20	; Fireball destroyed

loc_B2E1:
		bra	loc_B2E4
; ---------------------------------------------------------------------------

locret_B2E3:
		rts
; ---------------------------------------------------------------------------

loc_B2E4:
		ldd	<DPbyte_C4
		bmi	loc_B2F8
		cmpd	<DPbyte_C8
		bhi	loc_B2F8
		subd	<DPbyte_D0
		bhi	loc_B307
		lda	#4
		sta	<DPbyte_BD
		jmp	loc_8ACF
; ---------------------------------------------------------------------------

loc_B2F8:
		ldd	<DPbyte_C8
		bmi	loc_B307
		subd	<DPbyte_D0
		bhi	loc_B307
		lda	#4
		sta	<DPbyte_BD
		jmp	loc_A54B
; ---------------------------------------------------------------------------

loc_B307:
		ldd	<DPbyte_D0
		bmi	locret_B32A
		lda	#$FF
		sta	<DPbyte_BD
		lda	#$F
		sta	byte_4B23
		lda	<DPbyte_D0
		ldb	#3
		mul
		cmpd	#$E0 ; '‡'
		bcs	loc_B321
		ldb	#$E0 ; '‡'

loc_B321:
		stb	byte_4B22
		ldd	#$6680
		std	word_4B20

locret_B32A:
		rts
; End of function sub_B2D2


; =============== S U B	R O U T	I N E =======================================


sub_B32B:

; FUNCTION CHUNK AT 8ACF SIZE 0000009E BYTES

		lda	<DPbyte_BC
		beq	locret_B33D
		ldd	<DPbyte_CC
		bmi	loc_B339
		subd	<DPbyte_C4
		bcs	loc_B33E
		bra	loc_B345
; ---------------------------------------------------------------------------

loc_B339:
		lda	<DPbyte_C4
		bge	loc_B345

locret_B33D:
		rts
; ---------------------------------------------------------------------------

loc_B33E:
		lda	#4
		sta	<DPbyte_BD
		jmp	sub_AD20	; Fireball destroyed
; ---------------------------------------------------------------------------

loc_B345:
		lda	#4
		sta	<DPbyte_BD
		jmp	loc_8ACF
; End of function sub_B32B

; ---------------------------------------------------------------------------
		fcb $B9, $94, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF
aCopyright1983Atar:fcc "COPYRIGHT 1983 ATARI"
		fcb 4, $BC, $96, $FA, $5B
aAllyWasTheWhipcra:fcc "(ALLY WAS THE WHIPCRACKER"

; =============== S U B	R O U T	I N E =======================================


sub_B3E4:
		lda	word_49BF+1
		cmpa	#3
; End of function sub_B3E4


; =============== S U B	R O U T	I N E =======================================


sub_B3E9:
		bcs	loc_B3F0
		lda	#0
		sta	word_49BF+1

loc_B3F0:
		lda	#1
		sta	<DPbyte_9C
		lda	#$B
		sta	<DPbyte_DC
		sta	<DPbyte_9D
		jsr	sub_CD38	; Trench left side turret calcs
		jsr	sub_B43F
		lda	<DPbyte_9D
		sta	<DPbyte_DC
		jsr	sub_CD44	; Trench right side turret calcs
		jsr	sub_B579
		lda	#2
		sta	<DPbyte_9C
		lda	#$E
		sta	<DPbyte_DC
		sta	<DPbyte_9D
		jsr	sub_CD38	; Trench left side turret calcs
		jsr	sub_B43F
		lda	<DPbyte_9D
		sta	<DPbyte_DC
		jsr	sub_CD44	; Trench right side turret calcs
		jsr	sub_B579
		lda	#3
		sta	<DPbyte_9C
		lda	#$C
		sta	<DPbyte_DC
		sta	<DPbyte_9D
		jsr	sub_CD38	; Trench left side turret calcs
		jsr	sub_B43F
		lda	<DPbyte_9D
		sta	<DPbyte_DC
		jsr	sub_CD44	; Trench right side turret calcs
		jsr	sub_B579
		rts
; End of function sub_B3E9


; =============== S U B	R O U T	I N E =======================================


sub_B43F:
		lda	#0		; Trench
		sta	word_49BD
		lda	word_49BF+1
		sta	word_49BD+1
		lda	#$88 ; 'à'
		sta	byte_49C1
		ldb	MReg20		; XT2
		lsrb
		lsrb
		lsrb
		andb	#$F
		ldx	#$4989
		abx
		stx	<DPbyte_64	; Pointer to Tie fighter data
		lda	MReg20		; XT2
		anda	#$F8 ; '¯'
		adda	#4
		ldb	#0
		std	MReg3C
		ldd	#$FC00
		std	MReg3D

loc_B46F:
		ldd	#$F200
		std	MReg3E
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		cmpx	#$4999
		bcs	loc_B47F
		leax	<-16,x

loc_B47F:
		lda	,x+
		stx	<DPbyte_64	; Pointer to Tie fighter data

loc_B483:
		sta	<DPbyte_9E
		anda	#3
		cmpa	<DPbyte_9C
		lbne	loc_B516
		lda	<DPbyte_9D
		sta	<DPbyte_DC
		ldd	#$F		; Point	BIC to $5078 MReg3C
		std	MW1
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		lda	<DPbyte_9C
		cmpa	#2
		bne	loc_B4B5
		inc	word_49BD
		ldb	word_49BD+1
		aslb
		ldx	#word_B6B3
		ldd	b,x
		std	,y++
		lda	byte_49C1
		sta	-1,y

loc_B4B5:
		ldd	MReg3C
		subd	MReg20		; XT2
		cmpd	#$1000
		bgt	loc_B510
		lda	<DPbyte_9D
		cmpa	#$E
		bne	loc_B50B
		ldd	MReg00		; Math result X
		subd	#0
		blt	loc_B516
		ldd	MReg21		; YT2
		bgt	loc_B50B
		ldd	MReg3E
		addd	#$200
		subd	MReg22		; ZT2
		blt	loc_B50B
		subd	#$400
		bgt	loc_B50B
		ldd	MReg3C
		subd	MReg20		; XT2
		subd	#$400
		bhi	loc_B50B
		lda	#$F
		sta	<DPbyte_DC
		lda	<DPbyte_60	; Shield count
		blt	loc_B4FD
		jsr	sub_9874
		jsr	Sound_26	; Explosion

loc_B4FD:
		lda	<DPbyte_63
		bne	loc_B50B
		lda	#$4E ; 'N'
		ldb	PRNG
		bpl	loc_B509
		nega

loc_B509:
		sta	<DPbyte_63

loc_B50B:				; Trench calcs
		jsr	sub_CD5C
		bra	loc_B513
; ---------------------------------------------------------------------------

loc_B510:
		jsr	sub_CD50

loc_B513:				; Function select for an object
		jsr	sub_CD74

loc_B516:
		ldd	MReg3E
		addd	#$400
		std	MReg3E
		lda	<DPbyte_9E
		lsra
		lsra
		lbne	loc_B483
		lda	<DPbyte_9C
		cmpa	#2
		bne	loc_B565
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		lda	>$F,x

loc_B533:
		asla
		bcc	loc_B53D
		bmi	loc_B53D
		inc	word_49BD
		bra	loc_B540
; ---------------------------------------------------------------------------

loc_B53D:
		asla
		bne	loc_B533

loc_B540:
		lda	word_49BD
		beq	loc_B565
		lda	word_49BD+1
		inca
		cmpa	#3
		bcs	loc_B54F
		lda	#0

loc_B54F:
		sta	word_49BD+1
		lda	byte_49C1
		suba	#8
		cmpa	#$40 ; '@'
		bcc	loc_B55D
		lda	#$40 ; '@'

loc_B55D:
		sta	byte_49C1
		lda	#0
		sta	word_49BD

loc_B565:
		ldd	MReg3C
		addd	#$800
		std	MReg3C
		subd	MReg20		; XT2
		subd	#$7000
		lbcs	loc_B46F
		rts
; End of function sub_B43F


; =============== S U B	R O U T	I N E =======================================


sub_B579:
		lda	#0
		sta	word_49BD
		lda	word_49BF+1
		sta	word_49BD+1
		lda	#$88 ; 'à'
		sta	byte_49C1
		ldb	MReg20		; XT2
		lsrb
		lsrb
		lsrb
		andb	#$F
		ldx	#$4999
		abx
		stx	<DPbyte_64	; Pointer to Tie fighter data
		lda	MReg20		; XT2
		anda	#$F8 ; '¯'
		adda	#4
		ldb	#0
		std	MReg3C
		ldd	#$400
		std	MReg3D

loc_B5A9:
		ldd	#$F200
		std	MReg3E
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		cmpx	#$49A9
		bcs	loc_B5B9
		leax	<-16,x

loc_B5B9:
		lda	,x+
		stx	<DPbyte_64	; Pointer to Tie fighter data

loc_B5BD:
		sta	<DPbyte_9E
		anda	#3
		cmpa	<DPbyte_9C
		lbne	loc_B650
		lda	<DPbyte_9D
		sta	<DPbyte_DC
		ldd	#$F
		std	MW1		; Point	BIC to $5078 MReg3C
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		lda	<DPbyte_9C
		cmpa	#2
		bne	loc_B5EF
		inc	word_49BD
		ldb	word_49BD+1
		aslb
		ldx	#word_B6B3
		ldd	b,x
		std	,y++
		lda	byte_49C1
		sta	-1,y

loc_B5EF:
		ldd	MReg3C
		subd	MReg20		; XT2
		cmpd	#$1000
		bgt	loc_B64A
		lda	<DPbyte_9D
		cmpa	#$E
		bne	loc_B645
		ldd	MReg00		; Math result X
		subd	#0
		blt	loc_B650
		ldd	MReg21		; YT2
		blt	loc_B645
		ldd	MReg3E
		addd	#$200
		subd	MReg22		; ZT2
		blt	loc_B645
		subd	#$400
		bgt	loc_B645
		ldd	MReg3C
		subd	MReg20		; XT2
		subd	#$400
		bhi	loc_B645
		lda	#$F
		sta	<DPbyte_DC
		lda	<DPbyte_60	; Shield count
		blt	loc_B637
		jsr	sub_9874
		jsr	Sound_26	; Explosion

loc_B637:
		lda	<DPbyte_63
		bne	loc_B645
		lda	#$4E ; 'N'
		ldb	PRNG
		bpl	loc_B643
		nega

loc_B643:
		sta	<DPbyte_63

loc_B645:				; Trench calcs
		jsr	sub_CD5C
		bra	loc_B64D
; ---------------------------------------------------------------------------

loc_B64A:
		jsr	sub_CD50

loc_B64D:				; Function select for an object
		jsr	sub_CD74

loc_B650:
		ldd	MReg3E
		addd	#$400
		std	MReg3E
		lda	<DPbyte_9E
		lsra
		lsra
		lbne	loc_B5BD
		lda	<DPbyte_9C
		cmpa	#2
		bne	loc_B69F
		ldx	<DPbyte_64	; Pointer to Tie fighter data
		lda	$FFEF,x

loc_B66D:
		asla
		bcc	loc_B677
		bmi	loc_B677
		inc	word_49BD
		bra	loc_B67A
; ---------------------------------------------------------------------------

loc_B677:
		asla
		bne	loc_B66D

loc_B67A:
		lda	word_49BD
		beq	loc_B69F
		lda	word_49BD+1
		inca
		cmpa	#3
		bcs	loc_B689
		lda	#0

loc_B689:
		sta	word_49BD+1
		lda	byte_49C1
		suba	#8
		cmpa	#$40 ; '@'
		bcc	loc_B697
		lda	#$40 ; '@'

loc_B697:
		sta	byte_49C1
		lda	#0
		sta	word_49BD

loc_B69F:
		ldd	MReg3C
		addd	#$800
		std	MReg3C
		subd	MReg20		; XT2
		subd	#$7000
		lbcs	loc_B5A9
		rts
; End of function sub_B579

; ---------------------------------------------------------------------------
word_B6B3:	fdb $6680
		fdb $6380
		fdb $6580

; =============== S U B	R O U T	I N E =======================================

; Insert vector	instructions at	joystick position for laser explosion 2

sub_B6B9:
		jsr	sub_B6C7
		jsr	sub_B6D7	; Insert vector	instructions at	joystick position for laser explosion
		rts
; End of function sub_B6B9


; =============== S U B	R O U T	I N E =======================================

; Insert vector	instructions at	joystick position for laser explosion 3

sub_B6C0:
		jsr	sub_B6CC
		jsr	sub_B6D7	; Insert vector	instructions at	joystick position for laser explosion
		rts
; End of function sub_B6C0


; =============== S U B	R O U T	I N E =======================================


sub_B6C7:
		ldd	#$6380
		std	,y++
; End of function sub_B6C7


; =============== S U B	R O U T	I N E =======================================


sub_B6CC:
		ldd	#$A012
		std	,y++
		ldd	word_32FE
		std	,y++
		rts
; End of function sub_B6CC


; =============== S U B	R O U T	I N E =======================================

; Insert vector	instructions at	joystick position for laser explosion

sub_B6D7:
		lda	<DPbyte_7D	; Joystick X
		bpl	loc_B6DC
		nega

loc_B6DC:
		ldb	#$6E ; 'n'
		mul
		ldb	<DPbyte_7D	; Joystick X
		bpl	loc_B6E4
		nega

loc_B6E4:
		tfr	a, b
		sex
		std	word_4B1C
		anda	#$1F
		std	2,y
		std	8,y
		std	$E,y
		std	$14,y
		std	$1A,y
		lda	<DPbyte_7F	; Joystick Y
		bpl	loc_B6FD
		nega

loc_B6FD:
		ldb	#$50 ; 'P'
		mul
		ldb	<DPbyte_7F	; Joystick Y
		bpl	loc_B705
		nega

loc_B705:
		tfr	a, b
		sex
		std	word_4B1E
		anda	#$1F
		std	,y
		std	6,y
		std	$C,y
		std	$12,y
		std	$18,y
		ldd	#$BAAC
		std	4,y
		ldd	#$BA0D
		std	$A,y
		ldd	#$BB33
		std	$10,y
		ldd	#$BAE6
		std	$16,y
		ldd	#$BA5A
		std	$1C,y
		leay	$1E,y
		rts
; End of function sub_B6D7


; =============== S U B	R O U T	I N E =======================================


sub_B739:
		lda	#0
		sta	3,x
		jsr	sub_8E1C
		pshs	x,u
		jsr	sub_B76C
		puls	u,x
		rts
; End of function sub_B739

; ---------------------------------------------------------------------------
jt1:		fdb sub_B9C0
		fdb sub_B9C0
		fdb sub_B9C0
		fdb sub_B9C0
		fdb sub_B9C0
		fdb sub_B9C0
		fdb sub_B9F9
		fdb sub_B9F9
		fdb sub_B9F9
off_B75A:	fdb sub_BAA0		; Tie/bunker/tower fragments table
		fdb loc_BAA4
		fdb loc_BAA8
		fdb loc_BAAC
		fdb loc_BAB0
		fdb loc_BAB4
		fdb sub_BB1A
		fdb sub_BB1E
		fdb sub_BB16

; =============== S U B	R O U T	I N E =======================================


sub_B76C:
		ldu	,x
		jsr	sub_B948
		lda	#6
		sta	$C,x
		lda	#$18
		sta	$D,x
		ldd	#0
		subd	-$E,u
		jsr	Shift_D_R_6	; Shift	D register right
		std	6,x
		addd	8,u
		std	,x
		ldd	#0
		subd	-6,u
		jsr	Shift_D_R_6	; Shift	D register right
		std	8,x
		addd	$A,u
		std	2,x
		ldd	#0
		subd	2,u
		jsr	Shift_D_R_6	; Shift	D register right
		std	$A,x
		addd	$C,u
		std	4,x
		jsr	sub_B83F
		jsr	sub_B948
		lda	#7
		sta	$C,x
		lda	#$18
		sta	$D,x
		ldd	-$E,u
		jsr	Shift_D_R_6	; Shift	D register right
		std	6,x
		addd	8,u
		std	,x
		ldd	-6,u
		jsr	Shift_D_R_6	; Shift	D register right
		std	8,x
		addd	$A,u
		std	2,x
		ldd	2,u
		jsr	Shift_D_R_6	; Shift	D register right
		std	$A,x
		addd	$C,u
		std	4,x
		jsr	sub_B83F
		jsr	sub_B948
		lda	#8
		sta	$C,x
		lda	#$10
		sta	$D,x
		ldd	8,u
		std	,x
		std	6,x
		ldd	$A,u
		std	2,x
		std	8,x
		ldd	$C,u
		std	4,x
		std	$A,x
		lda	6,x
		ldb	#$80 ; 'Ä'

loc_B7F6:
		aslb
		rola
		bvc	loc_B7FE
		rora
		rorb
		bra	loc_B81C
; ---------------------------------------------------------------------------

loc_B7FE:
		asl	9,x
		rol	8,x
		bvc	loc_B80C
		ror	8,x
		ror	9,x
		asra
		rorb
		bra	loc_B81C
; ---------------------------------------------------------------------------

loc_B80C:
		asl	$B,x
		rol	$A,x
		bvc	loc_B7F6
		ror	$A,x
		ror	$B,x
		asr	8,x
		asr	9,x
		asra
		rorb

loc_B81C:
		subd	,x
		jsr	Shift_D_R_4
		ldb	PRNG
		std	6,x
		ldd	8,x
		subd	2,x
		jsr	Shift_D_R_4
		ldb	PRNG
		std	8,x
		ldd	$A,x
		subd	4,x

loc_B836:
		jsr	Shift_D_R_4
		ldb	PRNG
		std	$A,x
		rts
; End of function sub_B76C


; =============== S U B	R O U T	I N E =======================================


sub_B83F:
		ldd	-$A,u
		addd	6,x
		std	6,x
		ldd	-2,u
		addd	8,x
		std	8,x

loc_B84B:
		ldd	6,u
		addd	$A,x
		std	$A,x
		rts
; End of function sub_B83F


; =============== S U B	R O U T	I N E =======================================


sub_B852:
		ldd	#1
		std	<DPbyte_1
		ldd	#$203
		std	<DPbyte_3
		bra	loc_B868
; End of function sub_B852


; =============== S U B	R O U T	I N E =======================================


sub_B85E:
		ldd	#$304
		std	<DPbyte_1
		ldd	#$502
		std	<DPbyte_3

loc_B868:
		jsr	sub_B948
		lda	<DPbyte_1
		sta	$C,x
		lda	#$20 ; ' '
		sta	$D,x
		ldd	MReg0C		; XT

loc_B876:
		std	,x
		ldd	MReg0D		; YT
		adda	#$FE ; '˛'

loc_B87D:
		std	2,x
		ldd	MReg0E		; ZT
		std	4,x
		ldd	MReg4C
		adda	#$7F ; ''
		subd	MReg0C		; XT
		jsr	Shift_D_R_5	; Shift	D register right
		ldb	PRNG
		std	6,x
		ldd	MReg4D
		adda	#$C1 ; '¡'
		subd	MReg0D		; YT
		jsr	Shift_D_R_5	; Shift	D register right
		ldb	PRNG
		std	8,x
		lda	<DPbyte_4
		ldb	PRNG
		jsr	Shift_D_L_2
		std	$A,x
		jsr	sub_B948
		lda	<DPbyte_2
		sta	$C,x
		lda	#$20 ; ' '
		sta	$D,x
		ldd	MReg0C		; XT
		adda	#2
		std	,x
		ldd	MReg0D		; YT
		std	2,x
		ldd	MReg0E		; ZT
		std	4,x
		ldd	MReg4C
		adda	#$7F ; ''
		subd	MReg0C		; XT
		jsr	Shift_D_R_5	; Shift	D register right
		ldb	PRNG
		std	6,x
		ldd	MReg4D
		subd	MReg0D		; YT
		jsr	Shift_D_R_5	; Shift	D register right
		ldb	PRNG
		std	8,x
		lda	<DPbyte_4
		ldb	PRNG
		jsr	Shift_D_L_2
		std	$A,x
		jsr	sub_B948
		lda	<DPbyte_3
		sta	$C,x
		lda	#$20 ; ' '
		sta	$D,x
		ldd	MReg0C		; XT
		std	,x
		ldd	MReg0D		; YT
		adda	#2
		std	2,x
		ldd	MReg0E		; ZT
		std	4,x
		ldd	MReg4C
		adda	#$7F ; ''
		subd	MReg0C		; XT
		jsr	Shift_D_R_5	; Shift	D register right
		ldb	PRNG
		std	6,x
		ldd	MReg4D
		adda	#$3F ; '?'
		subd	MReg0D		; YT
		jsr	Shift_D_R_5	; Shift	D register right
		ldb	PRNG
		std	8,x
		lda	<DPbyte_4	; Game over/insert coins timer
		ldb	PRNG
		jsr	Shift_D_L_2
		std	$A,x
		rts
; End of function sub_B85E


; =============== S U B	R O U T	I N E =======================================


sub_B939:
		ldx	#byte_49E2	; 3D Object state data 2. 8 slots of 14	bytes

loc_B93C:
		lda	#0
		sta	$D,x		; Free up object state slot
		leax	$E,x
		cmpx	#byte_49E2+$70	; 3D Object state data 2. 8 slots of 14	bytes
		bcs	loc_B93C
		rts
; End of function sub_B939


; =============== S U B	R O U T	I N E =======================================


sub_B948:
		ldb	<DPbyte_A2	; 3D Object slot select
		incb
		cmpb	#8
		bcs	loc_B951
		ldb	#0

loc_B951:				; 3D Object slot select
		stb	<DPbyte_A2
		lda	#$E
		mul
		ldx	#byte_49E2	; 3D Object state data 2. 8 slots of 14	bytes
		leax	d,x
		rts
; End of function sub_B948

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_B98B

loc_B95C:
		ldd	#$14BD
		std	MReg11		; Sine for rotation
		ldd	#$3C8C
		std	MReg12		; Cosine for rotation
		ldd	#$18
		std	MW1		; Point	BIC to $50C0
		lda	#0		; Roll
		jsr	Math_Run_Start	; Do math program run
		ldd	#$590
		std	MReg11		; Sine for rotation
		ldd	#$3FC2
		std	MReg12		; Cosine for rotation
		ldd	#$18
		std	MW1		; Point	BIC to $50C0
		lda	#$E		; Pitch
		jsr	Math_Run_Start	; Do math program run
		rts
; END OF FUNCTION CHUNK	FOR sub_B98B

; =============== S U B	R O U T	I N E =======================================

; Check	if tie/bunker/tower been hit

sub_B98B:

; FUNCTION CHUNK AT B95C SIZE 0000002F BYTES

		ldx	#byte_49E2	; 3D Object state data 2. 8 slots of 14	bytes

loc_B98E:
		lda	$D,x
		beq	loc_B9A1	; If object state slot active then
		dec	$D,x
		ldb	$C,x
		cmpb	#9
		bcs	loc_B99B
		swi

loc_B99B:
		ldu	#jt1
		aslb
		jsr	[b,u]

loc_B9A1:
		leax	$E,x
		cmpx	#byte_49E2+$70	; 3D Object state data 2. 8 slots of 14	bytes
		bcs	loc_B98E	; Loop until all 3D Object states processed
		ldx	#byte_49E2	; 3D Object state data 2. 8 slots of 14	bytes

loc_B9AB:
		lda	$D,x
		beq	loc_B9B2
		jmp	loc_B95C
; ---------------------------------------------------------------------------

loc_B9B2:
		leax	$E,x
		cmpx	#byte_49E2+$70	; 3D Object state data 2. 8 slots of 14	bytes
		bcs	loc_B9AB
		ldu	#$50D0
		jsr	sub_CDC3	; Initialise math registers matrix
		rts
; End of function sub_B98B


; =============== S U B	R O U T	I N E =======================================


sub_B9C0:
		ldd	6,x
		addd	,x
		std	,x
		ldd	#0
		subd	6,x
		jsr	Shift_D_R_5	; Shift	D register right
		addd	6,x
		std	6,x
		ldd	8,x
		addd	2,x
		std	2,x
		ldd	#0
		subd	8,x
		jsr	Shift_D_R_5	; Shift	D register right
		addd	8,x
		std	8,x
		ldd	4,x
		addd	$A,x
		bvs	loc_B9F1
		bge	loc_B9EF
		ldd	#0

loc_B9EF:
		std	4,x

loc_B9F1:
		ldd	$A,x
		subd	#$C8 ; '»'
		std	$A,x
		rts
; End of function sub_B9C0


; =============== S U B	R O U T	I N E =======================================


sub_B9F9:
		ldd	6,x
		addd	,x
		bvs	loc_BA01
		std	,x

loc_BA01:
		ldd	8,x
		addd	2,x
		bvs	loc_BA09
		std	2,x

loc_BA09:
		ldd	$A,x
		addd	4,x
		bvs	locret_BA11
		std	4,x

locret_BA11:
		rts
; End of function sub_B9F9


; =============== S U B	R O U T	I N E =======================================

; Process tie/tower/bunker explosions

sub_BA12:
		lda	#$18		; BIC points to	$50C0
		jsr	sub_CE18	; Run math program $80 Copy [BIC] to Matrix 3
		lda	#$40 ; '@'      ; Matrix 1 = Matrix 2 x Matrix 3
		jsr	Math_Run_Start	; Do math program run
		ldx	#byte_49E2	; 3D Object state data 2. 8 slots of 14	bytes

loc_BA1F:				; Pointer to Tie fighter data
		stx	<DPbyte_64
		lda	$D,x
		beq	loc_BA28
		jsr	sub_BA32	; Tie/bunker/tower hit explosion

loc_BA28:				; Pointer to Tie fighter data
		ldx	<DPbyte_64
		leax	$E,x
		cmpx	#byte_49E2+$70	; 3D Object state data 2. 8 slots of 14	bytes
		bcs	loc_BA1F
		rts
; End of function sub_BA12


; =============== S U B	R O U T	I N E =======================================


sub_BA32:
		ldd	,x
		std	MReg3C
		ldd	2,x
		std	MReg3D
		ldd	4,x
		std	MReg3E
		ldd	#$F
		std	MW1		; Point	BIC to $5078 MReg3C
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		ldd	MReg00		; Math result X
		bmi	loc_BA9D	; If object behind observer then remove
		std	MReg0C		; XT
		std	DVSRH
		ldd	MReg01		; Math result Y
		std	MReg0D		; YT
		bpl	loc_BA63
		coma
		negb
		sbca	#$FF

loc_BA63:				; XT
		subd	MReg0C
		bge	loc_BA9D	; Remove object	if outside visible limit
		ldd	MReg02		; Math result Z
		std	MReg0E		; ZT
		bpl	loc_BA74
		coma
		negb
		sbca	#$FF

loc_BA74:
		lsra
		rorb
		subd	MReg0C		; XT
		bge	loc_BA9D	; Remove object	if outside visible limit
		ldb	$C,x
		cmpb	#9
		bcs	loc_BA82
		swi

loc_BA82:				; Tie/bunker/tower fragments table
		ldu	#off_B75A
		aslb
		jsr	[b,u]		; Work out which colour	for tie/bunker/	tower fragments
		jsr	sub_CCD8	; Copy object 3D data to math ram
		jsr	sub_CD20	; Do 3D	object transform using Matrix 1
		jsr	sub_CD2C	; Format vectors for ties, and tower/bunker explosions
		ldd	#$7200
		std	,y++
		ldd	#$8040		; Insert vector	CNTR instruction
		std	,y++
		bra	locret_BA9F
; ---------------------------------------------------------------------------

loc_BA9D:				; Remove/clear object state flag
		clr	$D,x

locret_BA9F:
		rts
; End of function sub_BA32


; =============== S U B	R O U T	I N E =======================================


sub_BAA0:
		lda	#$14
		bra	loc_BABE
; ---------------------------------------------------------------------------

loc_BAA4:
		lda	#$15
		bra	loc_BABE
; ---------------------------------------------------------------------------

loc_BAA8:
		lda	#$16
		bra	loc_BABE
; ---------------------------------------------------------------------------

loc_BAAC:
		lda	#$11
		bra	loc_BAB8
; ---------------------------------------------------------------------------

loc_BAB0:
		lda	#$12
		bra	loc_BAB8
; ---------------------------------------------------------------------------

loc_BAB4:
		lda	#$13
		bra	*+2

loc_BAB8:
		sta	<DPbyte_DC
		lda	#$67 ; 'g'      ; Tower fragments colour
		bra	loc_BAC2
; ---------------------------------------------------------------------------

loc_BABE:
		sta	<DPbyte_DC
		lda	#$64 ; 'd'      ; Bunker fragments colour

loc_BAC2:
		ldb	$D,x
		cmpb	#7
		bhi	loc_BACE
		aslb
		aslb
		aslb
		aslb
		bra	loc_BAD0
; ---------------------------------------------------------------------------

loc_BACE:
		ldb	#$80 ; 'Ä'

loc_BAD0:
		std	,y++
		ldd	,x
		std	MReg3C
		ldd	2,x
		std	MReg3D
		ldd	#0
		std	MReg3E
		ldd	#$F
		std	MW1		; Point	BIC to $5078 MReg3C
		ldd	MReg0E		; ZT
		pshs	a,b,x,u
		ldu	MReg0D		; YT
		ldx	MReg0C		; XT
		lda	#$67 ; 'g'
		jsr	Math_Run_Start	; Do math program run
		stx	MReg0C		; XT
		stu	MReg0D		; YT
		puls	u,x,b,a
		std	MReg0E		; ZT
		ldd	MReg00		; Math result X
		std	DVSRH		; Do division
		jsr	sub_CCF0	; Get divider result and multiply by Math result Z, insert VCTR	instruction
		lda	#$72 ; 'r'      ; Vector SCAL instruction
		ldb	MReg0C		; XT
		aslb
		aslb
		std	,y++
		rts
; End of function sub_BAA0


; =============== S U B	R O U T	I N E =======================================


sub_BB16:
		ldb	#3
		bra	loc_BB22
; End of function sub_BB16


; =============== S U B	R O U T	I N E =======================================


sub_BB1A:
		ldb	#1
		bra	loc_BB22
; End of function sub_BB1A


; =============== S U B	R O U T	I N E =======================================


sub_BB1E:
		ldb	#2
		bra	*+2

loc_BB22:
		stb	<DPbyte_DC
		ldb	$D,x
		cmpb	#$1F
		bls	sub_BB2F	; Tie fighter hit colour cycle table
		ldd	#$A018
		bra	loc_BB35
; End of function sub_BB1E


; =============== S U B	R O U T	I N E =======================================

; Tie fighter hit colour cycle table

sub_BB2F:
		ldu	#word_BB3B
		aslb
		ldd	b,u

loc_BB35:
		std	,y++
		jsr	sub_CCF0	; Get divider result and multiply by Math result Z, insert VCTR	instruction
		rts
; End of function sub_BB2F

; ---------------------------------------------------------------------------
word_BB3B:	fdb $6230, $6230, $6240, $6240,	$6250, $6250, $6260, $6260
		fdb $6270, $6270, $6280, $6280,	$6290, $6290, $62A0, $62A0
		fdb $6780, $62A0, $6790, $62A0,	$67A0, $62A0, $67C0, $62A0
		fdb $66A0, $66A0, $66A0, $66A0,	$66A0, $66A0, $66A0, $66A0

; =============== S U B	R O U T	I N E =======================================


sub_BB7B:
		lda	#1
		sta	<DPbyte_A1	; Death	Star explosion state
		ldd	#1
		std	<DPbyte_9F
		rts
; End of function sub_BB7B


; =============== S U B	R O U T	I N E =======================================

; Death	Star explosion animation

sub_BB85:
		lda	<DPbyte_A1	; Death	Star explosion state
		asla
		ldx	#off_BB8E
		jsr	[a,x]

locret_BB8D:
		rts
; End of function sub_BB85

; ---------------------------------------------------------------------------
off_BB8E:	fdb locret_BB8D
		fdb sub_BB98
		fdb sub_BBBB
		fdb sub_BC1E
		fdb sub_BC85

; =============== S U B	R O U T	I N E =======================================


sub_BB98:
		ldd	#$6480
		ldu	#$76F0
		ldx	<DPbyte_9F
		jsr	sub_BCAE
		ldd	<DPbyte_9F
		addd	#2
		std	<DPbyte_9F
		cmpd	#$3F ; '?'
		bcc	locret_BBBA
		ldd	#1
		std	<DPbyte_9F
		inc	<DPbyte_A1	; Death	Star explosion state
		jsr	Sound_27

locret_BBBA:
		rts
; End of function sub_BB98


; =============== S U B	R O U T	I N E =======================================


sub_BBBB:
		ldx	<DPbyte_9F
		ldd	#$61FF
		ldu	#$76F0
		jsr	sub_BCAE
		ldd	<DPbyte_9F
		addd	#2
		std	<DPbyte_9F
		cmpd	#$3F ; '?'
		bcc	loc_BC0B
		ldb	#$3F ; '?'
		subb	<DPbyte_A0
		clra
		tfr	d, x
		ldd	#$64FF
		jsr	sub_BCAE
		ldd	<DPbyte_9F
		aslb
		rola
		aslb
		rola
		aslb
		rola
		coma
		comb
		bmi	loc_BBEF
		deca
		orb	#$80 ; 'Ä'

loc_BBEF:
		addd	#$7670
		tstb
		bmi	loc_BBF8
		deca
		andb	#$7F ; ''

loc_BBF8:
		tfr	d, u
		ldd	<DPbyte_9F
		lsrb
		lsrb
		andb	#7
		eorb	#7
		incb
		tfr	d, x
		ldd	#$64FF
		jsr	sub_BCC8

loc_BC0B:
		ldd	<DPbyte_9F
		cmpd	#$3F ; '?'
		bcs	locret_BC1D
		ldd	#1
		std	<DPbyte_9F
		inc	<DPbyte_A1	; Death	Star explosion state
		jsr	Sound_27

locret_BC1D:
		rts
; End of function sub_BBBB


; =============== S U B	R O U T	I N E =======================================


sub_BC1E:
		ldx	<DPbyte_9F
		ldd	#$67FF
		ldu	#$7670
		jsr	sub_BCAE
		ldd	<DPbyte_9F
		addd	#3
		std	<DPbyte_9F
		cmpd	#$3F ; '?'
		bcc	loc_BC43
		ldb	#$3F ; '?'
		subb	<DPbyte_A0
		clra
		tfr	d, x
		ldd	#$61FF
		jsr	sub_BCAE

loc_BC43:
		ldd	<DPbyte_9F
		cmpd	#$3F ; '?'
		bcc	loc_BC72
		aslb
		rola
		aslb
		rola
		aslb
		rola
		coma
		comb
		bmi	loc_BC58
		deca
		orb	#$80 ; 'Ä'

loc_BC58:
		addd	#$7670
		tstb
		bmi	loc_BC61
		deca
		andb	#$7F ; ''

loc_BC61:
		tfr	d, u
		ldd	<DPbyte_9F
		andb	#$F
		eorb	#$F
		incb
		tfr	d, x
		ldd	#$61FF
		jsr	sub_BCC8

loc_BC72:
		ldd	<DPbyte_9F
		cmpd	#$50 ; 'P'
		bcs	locret_BC84
		ldd	#$80 ; 'Ä'
		std	<DPbyte_9F
		inc	<DPbyte_A1	; Death	Star explosion state
		jsr	Sound_27

locret_BC84:
		rts
; End of function sub_BC1E


; =============== S U B	R O U T	I N E =======================================


sub_BC85:
		ldd	<DPbyte_9F
		subd	#4
		std	<DPbyte_9F
		cmpd	#8
		bcs	loc_BCA9
		addd	#$7500
		tfr	d, u
		ldd	<DPbyte_9F
		lsra
		rorb
		andb	#$3F ; '?'
		eorb	#$3F ; '?'
		tfr	d, x
		ldd	#$67FF
		jsr	sub_BCC8
		bra	locret_BCAD
; ---------------------------------------------------------------------------

loc_BCA9:
		lda	#0
		sta	<DPbyte_A1	; Death	Star explosion state

locret_BCAD:
		rts
; End of function sub_BC85


; =============== S U B	R O U T	I N E =======================================


sub_BCAE:
		std	,y++

loc_BCB0:
		ldd	#$1F98
		std	,y++
		ldd	#0
		std	,y++
		stu	,y++
		ldd	#$BD69
		std	,y++
		leau	-2,u
		leax	-1,x
		bne	loc_BCB0
		rts
; End of function sub_BCAE


; =============== S U B	R O U T	I N E =======================================


sub_BCC8:
		std	,y++

loc_BCCA:
		ldd	#$1F98
		std	,y++
		ldd	#0
		std	,y++
		stu	,y++
		ldd	#$BD69
		std	,y++
		tfr	u, d
		subd	#4
		andb	#$7F ; ''
		tfr	d, u
		leax	-1,x
		bne	loc_BCCA
		rts
; End of function sub_BCC8

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR Sound_3

Write_Sound:
		ldb	#$E

loc_BCEB:
		tst	SOUNDIO+1
		bpl	loc_BCF5
		decb
		bne	loc_BCEB
		lda	#0

loc_BCF5:
		sta	SOUNDIO
		rts
; END OF FUNCTION CHUNK	FOR Sound_3

; =============== S U B	R O U T	I N E =======================================


Sound_1:
		lda	#1
		jmp	Write_Sound
; End of function Sound_1


; =============== S U B	R O U T	I N E =======================================


Sound_2:
		lda	#2
		jmp	Write_Sound
; End of function Sound_2


; =============== S U B	R O U T	I N E =======================================

; Attributes: noreturn

Sound_3:

; FUNCTION CHUNK AT BCE9 SIZE 00000010 BYTES

		lda	#3
		jmp	Write_Sound
; End of function Sound_3


; =============== S U B	R O U T	I N E =======================================


Sound_4:
		lda	#4
		jmp	Write_Sound
; End of function Sound_4


; =============== S U B	R O U T	I N E =======================================


Sound_5:
		lda	#5
		jmp	Write_Sound
; End of function Sound_5


; =============== S U B	R O U T	I N E =======================================


Sound_6:
		lda	#6
		jmp	Write_Sound
; End of function Sound_6


; =============== S U B	R O U T	I N E =======================================


Sound_7:
		lda	#7
		jmp	Write_Sound
; End of function Sound_7


; =============== S U B	R O U T	I N E =======================================


Sound_8:
		lda	#8
		jmp	Write_Sound
; End of function Sound_8


; =============== S U B	R O U T	I N E =======================================


Sound_9:
		lda	#9
		jmp	Write_Sound
; End of function Sound_9


; =============== S U B	R O U T	I N E =======================================


Sound_A:
		lda	#$A
		jmp	Write_Sound
; End of function Sound_A


; =============== S U B	R O U T	I N E =======================================


Sound_B:
		lda	#$B
		jmp	Write_Sound
; End of function Sound_B


; =============== S U B	R O U T	I N E =======================================


Sound_C:
		lda	#$C
		jmp	Write_Sound
; End of function Sound_C


; =============== S U B	R O U T	I N E =======================================


Sound_D:
		lda	#$D
		jmp	Write_Sound
; End of function Sound_D


; =============== S U B	R O U T	I N E =======================================


Sound_E:
		lda	#$E
		jmp	Write_Sound
; End of function Sound_E


; =============== S U B	R O U T	I N E =======================================


Sound_F:
		lda	#$F
		jmp	Write_Sound
; End of function Sound_F


; =============== S U B	R O U T	I N E =======================================


Sound_10:
		lda	#$10
		jmp	Write_Sound
; End of function Sound_10


; =============== S U B	R O U T	I N E =======================================

; Remember

Sound_11:
		lda	#$11
		jmp	Write_Sound
; End of function Sound_11


; =============== S U B	R O U T	I N E =======================================


Sound_12:
		lda	#$12
		jmp	Write_Sound
; End of function Sound_12


; =============== S U B	R O U T	I N E =======================================

; Look at the size of that thing

Sound_13:
		lda	#$13
		jmp	Write_Sound
; End of function Sound_13


; =============== S U B	R O U T	I N E =======================================

; Stay in attack formation

Sound_14:
		lda	#$14
		jmp	Write_Sound
; End of function Sound_14


; =============== S U B	R O U T	I N E =======================================


Sound_15:
		lda	#$15
		jmp	Write_Sound
; End of function Sound_15


; =============== S U B	R O U T	I N E =======================================

; Force	is strong in this one

Sound_16:
		lda	#$16
		jmp	Write_Sound
; End of function Sound_16


; =============== S U B	R O U T	I N E =======================================

; Red 5	I'm going in

Sound_17:
		lda	#$17
		jmp	Write_Sound
; End of function Sound_17


; =============== S U B	R O U T	I N E =======================================

; Luke trust me

Sound_18:
		lda	#$18
		jmp	Write_Sound
; End of function Sound_18


; =============== S U B	R O U T	I N E =======================================


Sound_19:
		lda	#$19
		jmp	Write_Sound
; End of function Sound_19


; =============== S U B	R O U T	I N E =======================================

; Yahoo	you're all clear kid

Sound_1A:
		lda	#$1A
		jmp	Write_Sound
; End of function Sound_1A


; =============== S U B	R O U T	I N E =======================================

; High score

Sound_1B:
		lda	#$1B
		jmp	Write_Sound
; End of function Sound_1B


; =============== S U B	R O U T	I N E =======================================


Sound_1C:
		lda	#$1C
		jmp	Write_Sound
; End of function Sound_1C


; =============== S U B	R O U T	I N E =======================================

; Imperial March

Sound_1D:
		lda	#$1D
		jmp	Write_Sound
; End of function Sound_1D


; =============== S U B	R O U T	I N E =======================================

; Enter	Death Star

Sound_1E:
		lda	#$1E
		jmp	Write_Sound
; End of function Sound_1E


; =============== S U B	R O U T	I N E =======================================

; Death	Star destroyed

Sound_1F:
		lda	#$1F
		jmp	Write_Sound
; End of function Sound_1F


; =============== S U B	R O U T	I N E =======================================

; Towers 1 music

Sound_20:
		lda	#$20 ; ' '
		jmp	Write_Sound
; End of function Sound_20


; =============== S U B	R O U T	I N E =======================================

; Towers 2 music

Sound_21:
		lda	#$21 ; '!'
		jmp	Write_Sound
; End of function Sound_21


; =============== S U B	R O U T	I N E =======================================

; Trench music

Sound_22:
		lda	#$22 ; '"'
		jmp	Write_Sound
; End of function Sound_22


; =============== S U B	R O U T	I N E =======================================


Sound_23:
		lda	#$23 ; '#'
		jmp	Write_Sound
; End of function Sound_23


; =============== S U B	R O U T	I N E =======================================

; Space	wave 1 music

Sound_24:
		lda	#$24 ; '$'
		jmp	Write_Sound
; End of function Sound_24


; =============== S U B	R O U T	I N E =======================================

; Space	Wave 2 music

Sound_25:
		lda	#$25 ; '%'
		jmp	Write_Sound
; End of function Sound_25


; =============== S U B	R O U T	I N E =======================================

; Explosion

Sound_26:
		lda	#$26 ; '&'
		jmp	Write_Sound
; End of function Sound_26


; =============== S U B	R O U T	I N E =======================================


Sound_27:
		lda	#$27 ; '''
		jmp	Write_Sound
; End of function Sound_27


; =============== S U B	R O U T	I N E =======================================


Sound_28:
		lda	#$28 ; '('
		jmp	Write_Sound
; End of function Sound_28


; =============== S U B	R O U T	I N E =======================================


Sound_29:
		lda	#$29 ; ')'
		jmp	Write_Sound
; End of function Sound_29


; =============== S U B	R O U T	I N E =======================================


Sound_2A:
		lda	#$2A ; '*'
		jmp	Write_Sound
; End of function Sound_2A


; =============== S U B	R O U T	I N E =======================================


Sound_2B:
		lda	#$2B ; '+'
		jmp	Write_Sound
; End of function Sound_2B


; =============== S U B	R O U T	I N E =======================================


Sound_2C:
		lda	#$2C ; ','
		jmp	Write_Sound
; End of function Sound_2C


; =============== S U B	R O U T	I N E =======================================


Sound_2D:
		lda	#$2D ; '-'
		jmp	Write_Sound
; End of function Sound_2D


; =============== S U B	R O U T	I N E =======================================


Sound_2E:
		lda	#$2E ; '.'
		jmp	Write_Sound
; End of function Sound_2E


; =============== S U B	R O U T	I N E =======================================


Sound_2F:
		lda	#$2F ; '/'
		jmp	Write_Sound
; End of function Sound_2F


; =============== S U B	R O U T	I N E =======================================


Sound_30:
		lda	#$30 ; '0'
		jmp	Write_Sound
; End of function Sound_30


; =============== S U B	R O U T	I N E =======================================


Sound_31:
		lda	#$31 ; '1'
		jmp	Write_Sound
; End of function Sound_31


; =============== S U B	R O U T	I N E =======================================

; R2 beeps entering Death Star

Sound_32:
		lda	#$32 ; '2'
		jmp	Write_Sound
; End of function Sound_32


; =============== S U B	R O U T	I N E =======================================


Sound_33:
		lda	#$33 ; '3'
		jmp	Write_Sound
; End of function Sound_33


; =============== S U B	R O U T	I N E =======================================


Sound_34:
		lda	#$34 ; '4'
		jmp	Write_Sound
; End of function Sound_34


; =============== S U B	R O U T	I N E =======================================


Sound_35:
		lda	#$35 ; '5'
		jmp	Write_Sound
; End of function Sound_35


; =============== S U B	R O U T	I N E =======================================


Sound_36:
		lda	#$36 ; '6'
		jmp	Write_Sound
; End of function Sound_36


; =============== S U B	R O U T	I N E =======================================


Sound_37:
		lda	#$37 ; '7'
		jmp	Write_Sound
; End of function Sound_37


; =============== S U B	R O U T	I N E =======================================


Sound_38:
		lda	#$38 ; '8'
		jmp	Write_Sound
; End of function Sound_38


; =============== S U B	R O U T	I N E =======================================


Sound_39:
		lda	#$39 ; '9'
		jmp	Write_Sound
; End of function Sound_39


; =============== S U B	R O U T	I N E =======================================


Sound_3A:
		lda	#$3A ; ':'
		jmp	Write_Sound
; End of function Sound_3A


; =============== S U B	R O U T	I N E =======================================


Sound_3B:
		lda	#$3B ; ';'
		jmp	Write_Sound
; End of function Sound_3B


; =============== S U B	R O U T	I N E =======================================

; Display accounting screen

sub_BE20:
		lda	#$59 ; 'Y'

loc_BE22:				; Called from select screen, attract screen 1 +	3 when writing text
		jsr	sub_D8DF
		inca
		cmpa	#$65 ; 'e'
		bcs	loc_BE22
		lda	#$D3 ; '”'
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text
		ldd	#$6480
		std	,y++
		ldx	#$453C
		ldu	#word_C7BB

loc_BE3A:
		ldd	,u++
		std	,y++
		ldd	#$30 ; '0'
		std	,y++
		stu	byte_4AFA
		ldb	#5
		stb	<DPbyte_AD
		ldb	#5

loc_BE4C:
		lda	,x+
		jsr	loc_E7AD
		decb
		bpl	loc_BE4C
		ldd	#$8040
		std	,y++
		ldu	byte_4AFA
		cmpx	#$4554
		bcs	loc_BE3A
		ldd	word_C7C1
		std	,y++
		ldd	#$13C
		std	,y++
		lda	#1
		sta	<DPbyte_AD
		lda	byte_4588
		jsr	loc_E7AD
		lda	byte_4589
		jsr	loc_E7AD
		ldd	#$8040
		std	,y++
		ldx	#$4548
		jsr	sub_C6D4	; Read NOVRAM
		ldu	#word_4AFE
		ldx	#$4542
		jsr	sub_C6D7	; Read NOVRAM
		lda	byte_4AFC
		adda	word_4B00
		daa
		sta	byte_4AFC
		lda	byte_4AFB
		adca	word_4AFE+1
		daa
		sta	byte_4AFB
		lda	byte_4AFA
		adca	word_4AFE
		daa
		sta	byte_4AFA
		ldd	word_C7C3
		std	,y++
		ldd	#$30 ; '0'
		std	,y++
		ldb	#5
		stb	<DPbyte_AD
		lda	byte_4AFA
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	byte_4AFB
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	byte_4AFC
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	#$8040
		std	,y++
		ldx	#$4554
		jsr	sub_C6D4	; Read NOVRAM
		jsr	sub_C087
		ldd	word_C7C9
		std	,y++
		ldd	#$30 ; '0'
		std	,y++
		ldb	#7
		stb	<DPbyte_AD
		lda	byte_4AFA
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	byte_4AFB
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	byte_4AFC
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	byte_4AFD
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	#$8040
		std	,y++
		ldx	#$455C
		jsr	sub_C6D4	; Read NOVRAM
		jsr	sub_C087
		ldd	word_C7CB
		std	,y++
		ldd	#$30 ; '0'
		std	,y++
		ldb	#7
		stb	<DPbyte_AD
		lda	byte_4AFA
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	byte_4AFB
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	byte_4AFC
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	byte_4AFD
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	#$8040
		std	,y++
		ldx	#$454C
		jsr	sub_C6D4	; Read NOVRAM
		clr	byte_4AFA
		lda	byte_4AFB
		ora	byte_4AFC
		ora	byte_4AFD
		beq	loc_BF7C
		ldx	#$4554
		ldu	#word_4AFE
		jsr	sub_C6D7	; Read NOVRAM
		jsr	sub_C02F
		lda	byte_4AFA
		anda	#$F
		cmpa	#$F
		lda	byte_4AFA
		bcs	loc_BF69
		inc	byte_4AFA

loc_BF69:
		lsra
		lsra
		lsra
		lsra
		adda	byte_4AFA
		sta	byte_4AFA
		anda	#$F
		cmpa	#$F
		bcs	loc_BF7C
		inc	byte_4AFA

loc_BF7C:
		ldd	word_C7C5
		std	,y++
		ldd	#$30 ; '0'
		std	,y++
		lda	byte_4AFA
		jsr	sub_C70E
		ldd	#$8040
		std	,y++
		ldx	#$455C
		jsr	sub_C6D4	; Read NOVRAM
		lda	byte_4AFA
		ora	byte_4AFB
		ora	byte_4AFC
		ora	byte_4AFD
		beq	loc_BFB4
		ldx	#$4556
		ldu	#word_4AFE
		jsr	sub_C6D7	; Read NOVRAM
		clr	word_4B00+1
		jsr	sub_C02F

loc_BFB4:
		ldd	word_C7C7
		std	,y++
		ldd	#$30 ; '0'
		std	,y++
		clra
		ldb	byte_4AFA
		ldx	#$10
		jsr	sub_7720
		ldb	#1
		stb	<DPbyte_AD
		lda	word_4AD6
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	#$8040
		std	,y++
		ldb	#$11
		stb	byte_4AFA
		ldu	#word_C7CD	; Table	for game time history text positions
		stu	byte_4AFC

loc_BFE2:
		ldu	byte_4AFC
		ldd	,u++
		std	,y++
		cmpu	#word_C7CD+$14
		bcs	loc_BFF4
		ldd	#$1ED4
		bra	loc_BFF7
; ---------------------------------------------------------------------------

loc_BFF4:
		ldd	#$64 ; 'd'

loc_BFF7:
		std	,y++
		stu	byte_4AFC
		ldx	#unk_C7A3
		ldb	byte_4AFA
		lda	b,x
		jsr	sub_C70E
		ldd	$3002
		std	,y++
		std	,y++
		ldb	#0
		stb	<DPbyte_AD
		ldx	#$4564
		ldb	byte_4AFA
		aslb
		lda	b,x
		jsr	loc_E7AD
		incb
		lda	b,x
		jsr	loc_E7AD
		ldd	#$8040
		std	,y++
		dec	byte_4AFA
		bpl	loc_BFE2
		rts
; End of function sub_BE20


; =============== S U B	R O U T	I N E =======================================


sub_C02F:
		ldx	#word_4AFE
		lda	#1
		sta	word_4B02
		ldb	#3

loc_C039:
		lda	#$99 ; 'ô'
		suba	,-x
		adda	word_4B02
		daa
		sta	,x
		bcs	loc_C04A
		clr	word_4B02
		bra	loc_C04F
; ---------------------------------------------------------------------------

loc_C04A:
		lda	#1
		sta	word_4B02

loc_C04F:
		decb
		bpl	loc_C039
		ldb	#$FF

loc_C054:
		incb
		cmpb	#$EF ; 'Ô'
		beq	loc_C083
		lda	word_4B00+1
		adda	byte_4AFD
		daa
		sta	word_4B00+1
		lda	word_4B00
		adca	byte_4AFC
		daa
		sta	word_4B00
		lda	word_4AFE+1
		adca	byte_4AFB
		daa
		sta	word_4AFE+1
		lda	word_4AFE
		adca	byte_4AFA
		daa
		sta	word_4AFE
		bcs	loc_C054

loc_C083:
		stb	byte_4AFA
		rts
; End of function sub_C02F


; =============== S U B	R O U T	I N E =======================================


sub_C087:
		bsr	*+2
		andcc	#$FE ; '˛'
		ldb	#3
		ldx	#byte_4AFD

loc_C090:
		lda	,x
		adca	,x
		daa
		sta	,x
		leax	-1,x
		decb
		bpl	loc_C090
		rts
; End of function sub_C087


; =============== S U B	R O U T	I N E =======================================


sub_C09D:
		lda	#2
		jsr	sub_C2C3
		bne	locret_C0FE
		clra
		ldb	>byte_4815
		aslb
		rola
		ldb	>byte_4816
		aslb
		rola
		ldb	>byte_4817
		aslb
		rola
		tfr	a, b
		eorb	word_4AF4
		andb	word_4AF4
		sta	word_4AF4
		ldx	#$4548

loc_C0C2:
		lsrb
		bcc	loc_C0F7
		ldu	#word_4B5F
		jsr	sub_C6D7	; Read NOVRAM
		lda	word_4B61
		adda	#1
		daa
		sta	word_4B61
		lda	word_4B5F+1
		adca	#0
		daa
		sta	word_4B5F+1
		lda	word_4B5F
		adca	#0
		daa
		sta	word_4B5F
		ldu	#word_4B5F
		jsr	sub_C6F7
		lda	#2
		stb	word_4B61+1
		jsr	sub_C2B3
		ldb	word_4B61+1

loc_C0F7:
		leax	-6,x
		cmpx	#$453C
		bcc	loc_C0C2

locret_C0FE:
		rts
; End of function sub_C09D


; =============== S U B	R O U T	I N E =======================================

; NVRAM	something

sub_C0FF:
		lda	#2
		jsr	sub_C413
		ldx	#$4554
		jsr	sub_C6D4	; Read NOVRAM
		lda	byte_4AFD
		adda	>byte_481A
		daa
		sta	byte_4AFD
		lda	byte_4AFC
		adca	>byte_4819
		daa
		sta	byte_4AFC
		lda	byte_4AFB
		adca	#0
		daa
		sta	byte_4AFB
		lda	byte_4AFA
		adca	#0
		daa
		bcs	loc_C132
		sta	byte_4AFA

loc_C132:
		lda	#3
		stb	word_4B02
		ldu	#byte_4AFA
		jsr	loc_C6F9
		ldx	#$454E
		jsr	sub_C6D4	; Read NOVRAM
		lda	byte_4AFC
		adda	#1
		daa
		sta	byte_4AFC
		lda	byte_4AFB
		adca	#0
		daa
		sta	byte_4AFB
		lda	byte_4AFA
		adca	#0
		daa
		sta	byte_4AFA
		jsr	sub_C6F4
		ldx	#$4588
		jsr	sub_C6D4	; Read NOVRAM
		lda	byte_4B16
		cmpa	byte_4AFA
		bls	loc_C17B
		sta	byte_4AFA
		clr	byte_4AFB
		clr	byte_4AFC
		jsr	sub_C6F4

loc_C17B:
		ldx	#$4586
		lda	>byte_4819
		bne	loc_C19E
		lda	>byte_481A
		ldx	#$4564
		ldb	#$9A ; 'ö'
		subb	word_C7A4
		stb	byte_4AFA

loc_C191:
		adda	byte_4AFA
		daa
		bcc	loc_C19E
		leax	2,x
		cmpx	#$4586
		bcs	loc_C191

loc_C19E:
		lda	1,x
		anda	#$F
		adda	#1
		daa
		sta	1,x
		anda	#$F0 ; ''
		beq	loc_C1E9
		lda	,x
		anda	#$F
		adda	#1
		daa
		sta	,x
		anda	#$F0 ; ''
		beq	loc_C1E9
		ldx	#$4564

loc_C1BB:
		lda	,x
		asla
		asla
		asla
		asla
		sta	byte_4AFA
		lda	1,x
		anda	#$F
		adda	byte_4AFA
		bita	#$10
		beq	loc_C1D1
		suba	#6

loc_C1D1:
		lsra
		sta	1,x
		lsra
		lsra
		lsra
		lsra
		sta	,x
		leax	2,x
		cmpx	#$4588
		bcs	loc_C1BB
		lda	#5
		sta	,u
		lda	#0
		sta	1,u

loc_C1E9:
		lda	>byte_4866
		sta	byte_4AFA
		lda	>byte_4868
		sta	byte_4AFB
		lda	>byte_486F
		sta	byte_4AFC
		lda	>byte_4871
		sta	byte_4AFD
		ldx	#$4534
		ldu	#$4AFA
		lda	#3
		jsr	loc_C6F9
; End of function sub_C0FF


; =============== S U B	R O U T	I N E =======================================


sub_C20C:
		ldx	#$455C
		jsr	sub_C6D4	; Read NOVRAM
		orcc	#$10
		ldu	byte_4B06
		ldd	byte_4B04
		andcc	#$EF ; 'Ô'
		cmpd	byte_4AFA
		bhi	loc_C22A
		bcs	loc_C23D
		cmpu	byte_4AFC
		bls	loc_C23D

loc_C22A:
		std	byte_4AFA
		stu	byte_4AFC
		ldx	#$455C
		ldu	#$4AFA
		lda	#3
		jsr	loc_C6F9
		bra	loc_C249
; ---------------------------------------------------------------------------

loc_C23D:
		ldd	byte_4AFA
		std	byte_4B04
		ldd	byte_4AFC
		std	byte_4B06

loc_C249:
		lda	#2
		jmp	sub_C2B3
; End of function sub_C20C


; =============== S U B	R O U T	I N E =======================================


sub_C24E:
		cmpa	#3
		bcc	sub_C2B3
		cmpa	#2
		bcs	loc_C27F
		ldx	#word_C7B7
		ldb	a,x
		subb	#2
		stb	byte_4AFB
		ldb	#$45 ; 'E'
		stb	byte_4AFA
		ldx	#unk_C7B6
		ldb	a,x
		ldx	#(loc_C706+1)
		abx
		tfr	x, u
		ldx	#byte_4500	; NOVRAM
		abx

loc_C274:
		ldb	,u+
		stb	,x+
		cmpx	byte_4AFA
		bcs	loc_C274
		bra	sub_C2B3
; ---------------------------------------------------------------------------

loc_C27F:
		tfr	a, b
		tsta
		bne	loc_C29B
		lda	<Opt1_Shad
		sta	byte_4AFA
		lda	<Opt0_Shad
		sta	byte_4AFB
		lda	#0
		sta	byte_4AFC
		ldx	#byte_4500	; NOVRAM
		jsr	sub_C6F4
		bra	loc_C2B1
; ---------------------------------------------------------------------------

loc_C29B:
		ldx	#byte_4508
		ldu	#word_CC98	; High scores init table
		lda	#$B
		jsr	loc_C6F9
		ldx	#byte_4520
		ldu	#word_CC7A	; High score names
		lda	#8
		jsr	loc_C6F9

loc_C2B1:
		tfr	b, a
; End of function sub_C24E


; =============== S U B	R O U T	I N E =======================================


sub_C2B3:
		jsr	sub_C2C3
		beq	locret_C2C2
		stb	1,x
		lsrb
		lsrb
		lsrb
		lsrb
		stb	,x
		ldb	#$FF

locret_C2C2:
		rts
; End of function sub_C2B3


; =============== S U B	R O U T	I N E =======================================


sub_C2C3:
		leas	-3,s
		ldx	#word_C7B7
		ldb	a,x
		ldx	#unk_C7B6
		subb	a,x
		subb	#2
		stb	,s
		ldb	a,x
		ldx	#byte_4500	; NOVRAM
		abx
		ldb	#0
		stb	1,s
		orcc	#1

loc_C2DF:
		ldb	,x+
		andb	#$F
		adcb	1,s
		stb	1,s
		dec	,s
		bne	loc_C2DF
		adcb	#0
		stb	1,s
		ldb	,x
		aslb
		aslb
		aslb
		aslb
		stb	2,s
		ldb	1,x
		andb	#$F
		addb	2,s
		stb	2,s
		ldb	1,s
		cmpb	2,s
		leas	3,s
		rts
; End of function sub_C2C3


; =============== S U B	R O U T	I N E =======================================


sub_C306:
		ldx	#byte_4500	; NOVRAM
		ldu	#Scratch_RAM_start

loc_C30C:
		ldd	,x++
		std	,u++
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_C30C
		lda	#$FF
		sta	NVRecall
		ldx	#$100

loc_C31D:
		sta	WDCLR
		leax	-1,x
		bne	loc_C31D
		lda	#0
		sta	NVRecall
		ldx	#$A000

loc_C32C:
		sta	WDCLR
		leax	-1,x
		bne	loc_C32C
		ldx	#byte_4500	; NOVRAM
		ldy	#Scratch_RAM_start

loc_C33A:
		ldu	,x
		ldd	,y
		stu	,y++
		std	,x++
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_C33A
		lda	#3
		jsr	sub_C2C3
		beq	loc_C37C
		lda	#0
		jsr	sub_C2C3
		beq	loc_C36C
		jsr	sub_C3EE
		lda	#3
		jsr	sub_C3EE
		jsr	sub_C2C3
		beq	loc_C37C
		lda	#0
		jsr	sub_C2C3
		beq	loc_C36C

loc_C369:
		jsr	sub_C24E

loc_C36C:
		ldx	#unk_C7B6
		ldb	>3,x
		ldx	#byte_4500	; NOVRAM
		abx
		ldu	#byte_4500	; NOVRAM
		bra	loc_C3B7
; ---------------------------------------------------------------------------

loc_C37C:
		lda	#0
		jsr	sub_C2C3
		bne	loc_C3A7
		lda	byte_4596
		anda	#$F
		sta	byte_4AFA
		lda	byte_4506
		anda	#$F
		cmpa	byte_4AFA
		bne	loc_C3A5
		lda	byte_4597
		anda	#$F
		sta	byte_4AFA
		lda	byte_4507
		anda	#$F
		cmpa	byte_4AFA

loc_C3A5:
		beq	loc_C3C6

loc_C3A7:
		ldx	#unk_C7B6
		ldb	>3,x
		ldx	#byte_4500	; NOVRAM
		abx
		tfr	x, u
		ldx	#byte_4500	; NOVRAM

loc_C3B7:
		ldb	word_C7B7
		stb	word_4B02

loc_C3BD:
		ldb	,u+
		stb	,x+
		dec	word_4B02
		bne	loc_C3BD

loc_C3C6:
		lda	#2

loc_C3C8:
		jsr	sub_C2C3
		beq	loc_C3D8
		jsr	sub_C3EE
		jsr	sub_C2C3
		beq	loc_C3D8
		jsr	sub_C24E

loc_C3D8:
		deca
		bne	loc_C3C8
		ldx	#byte_455C
		jsr	sub_C6D4	; Read NOVRAM
		ldd	byte_4AFA
		std	byte_4B04
		ldd	byte_4AFC
		std	byte_4B06
		rts
; End of function sub_C306


; =============== S U B	R O U T	I N E =======================================


sub_C3EE:
		ldx	#word_C7B7
		ldb	a,x
		ldx	#byte_4500	; NOVRAM
		abx
		stx	byte_4AFA
		ldx	#unk_C7B6
		ldb	a,x
		ldx	#Scratch_RAM_start
		abx
		tfr	x, u
		ldx	#byte_4500	; NOVRAM
		abx

loc_C409:
		ldb	,u+
		stb	,x+
		cmpx	byte_4AFA
		bcs	loc_C409
		rts
; End of function sub_C3EE


; =============== S U B	R O U T	I N E =======================================


sub_C413:
		jsr	sub_C2C3
		beq	locret_C44F
		sta	byte_4AFA
		ldx	#byte_4500	; NOVRAM
		ldu	#Scratch_RAM_start

loc_C421:
		ldd	,x++
		std	,u++
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_C421
		jsr	sub_C6B8
		ldx	#byte_4500	; NOVRAM
		ldy	#Scratch_RAM_start

loc_C434:
		ldu	,x
		ldd	,y
		stu	,y++
		std	,x++
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_C434
		lda	byte_4AFA
		jsr	sub_C3EE
		jsr	sub_C2C3
		beq	locret_C44F
		jsr	sub_C24E

locret_C44F:
		rts
; End of function sub_C413


; =============== S U B	R O U T	I N E =======================================


sub_C450:
		lda	#$65 ; 'e'

loc_C452:				; Called from select screen, attract screen 1 +	3 when writing text
		jsr	sub_D8DF
		inca
		cmpa	#$74 ; 't'
		bcs	loc_C452
		lda	#$D4 ; '‘'
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text
		ldd	#$6280
		std	,y++
		lda	#$B
		sta	word_4AFE

loc_C469:
		lda	word_4AFE
		jsr	sub_C5A4
		dec	word_4AFE
		bpl	loc_C469
		jsr	sub_C690
		lda	byte_4598
		anda	#$F
		beq	locret_C4EA
		ldb	#$D5 ; '’'
		jsr	sub_E7C7	; Print	text string from pointer table
		lda	<DPbyte_AC
		anda	#$40 ; '@'
		beq	locret_C4EA
		lda	byte_4598
		anda	#8
		beq	loc_C498
		lda	#1
		jsr	sub_C24E
		jsr	sub_CC18

loc_C498:
		lda	byte_4598
		anda	#4
		beq	loc_C4B1
		ldx	#byte_454E
		ldd	#0

loc_C4A5:
		std	,x++
		cmpx	#byte_458E
		bcs	loc_C4A5
		lda	#2
		jsr	sub_C2B3

loc_C4B1:
		lda	byte_4598
		anda	#2
		beq	loc_C4DA
		lda	#0
		jsr	sub_C24E
		ldx	#unk_C7B6
		ldb	>3,x
		ldx	#byte_4500	; NOVRAM
		abx
		ldu	#byte_4500	; NOVRAM
		ldb	word_C7B7
		stb	word_4B02

loc_C4D1:
		ldb	,u+
		stb	,x+
		dec	word_4B02
		bne	loc_C4D1

loc_C4DA:
		lda	byte_4598
		anda	#1
		beq	loc_C4E4
		jsr	sub_C5F2

loc_C4E4:
		ldd	#0
		std	byte_4598

locret_C4EA:
		rts
; End of function sub_C450


; =============== S U B	R O U T	I N E =======================================


sub_C4EB:
		ldb	<DPbyte_43	; Game over/insert coins timer
		andb	#$F
		bne	loc_C519
		ldb	>word_487F
		cmpb	#$D0 ; '–'
		bcc	loc_C519
		cmpb	#$30 ; '0'
		bls	loc_C519
		tstb
		bmi	loc_C50C
		ldb	word_4AF6
		decb
		bpl	loc_C507
		ldb	#$B

loc_C507:
		stb	word_4AF6
		bra	loc_C519
; ---------------------------------------------------------------------------

loc_C50C:
		ldb	word_4AF6
		incb
		cmpb	#$B
		bls	loc_C516
		ldb	#0

loc_C516:
		stb	word_4AF6

loc_C519:
		ldx	#byte_C797
		lda	word_4AF6
		ldb	a,x
		stb	byte_4AFC
		lsrb
		lsrb
		lsrb
		andb	#3
		ldx	#byte_C737
		lda	b,x
		sta	byte_4AFA
		ldb	<DPbyte_AC
		andb	#$80 ; 'Ä'
		beq	locret_C5A3
		ldb	word_4AF4+1
		incb
		cmpb	byte_4AFA
		bls	loc_C542
		ldb	#0

loc_C542:
		sta	word_4AF4+1
		lda	byte_4AFC
		rola
		rola
		rola
		rola
		anda	#7

loc_C54E:
		deca
		bmi	loc_C557
		aslb
		asl	byte_4AFA
		bra	loc_C54E
; ---------------------------------------------------------------------------

loc_C557:
		lda	byte_4AFC
		anda	#7
		asla
		ldx	#byte_4590
		leax	a,x
		lda	,x
		asla
		asla
		asla
		asla
		sta	byte_4AFB
		lda	1,x
		anda	#$F
		adda	byte_4AFB
		sta	byte_4AFB
		eorb	byte_4AFB
		andb	byte_4AFA
		eorb	byte_4AFB
		stb	1,x
		lsrb
		lsrb
		lsrb
		lsrb
		stb	,x
		lda	#3
		jsr	sub_C2B3
		ldx	#byte_4500	; NOVRAM
		ldu	#Scratch_RAM_start

loc_C591:
		ldd	,x++
		std	,u++
		cmpx	#byte_4500+$FF	; NOVRAM
		bcs	loc_C591
		jsr	loc_C3A7
		lda	word_4AF6
		jsr	sub_C5A4

locret_C5A3:
		rts
; End of function sub_C4EB


; =============== S U B	R O U T	I N E =======================================


sub_C5A4:
		ldx	#byte_C797
		ldb	a,x
		stb	byte_4AFA
		andb	#7
		ldx	#byte_4590
		aslb
		abx
		ldb	byte_4AFA
		lsrb
		lsrb
		lsrb
		stb	byte_4AFA
		andb	#3
		ldu	#byte_C737
		leau	b,u
		ldb	byte_4AFA
		lsrb
		lsrb
		stb	byte_4AFA
		ldb	,x
		aslb
		aslb
		aslb
		aslb
		stb	byte_4AFB
		ldb	1,x
		andb	#$F
		addb	byte_4AFB

loc_C5DB:
		dec	byte_4AFA
		bmi	loc_C5E3
		lsrb
		bra	loc_C5DB
; ---------------------------------------------------------------------------

loc_C5E3:
		andb	,u
		stb	word_4AF4+1
		ldx	#byte_C7F1
		leax	a,x
		addb	,x
		jmp	sub_E7D3
; End of function sub_C5A4


; =============== S U B	R O U T	I N E =======================================


sub_C5F2:

; FUNCTION CHUNK AT C65B SIZE 0000001F BYTES

		ldx	#byte_4500	; NOVRAM
		ldu	#Scratch_RAM_start

loc_C5F8:
		ldd	,x++
		std	,u++
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_C5F8
		ldx	#byte_4500	; NOVRAM

loc_C604:
		lda	,x
		coma
		sta	,x+
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_C604
		sta	NSTORE
		jsr	sub_C688
		jsr	sub_C67A
		jsr	sub_C6B8
		ldx	#byte_4500	; NOVRAM

loc_C61D:
		lda	,x
		coma
		sta	,x+
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_C61D
		sta	NSTORE
		jsr	sub_C688
		jsr	sub_C641
		bne	loc_C65B
		jsr	sub_C67A
		jsr	sub_C6B8
		jsr	sub_C641
		beq	locret_C640
		jmp	loc_C65B
; ---------------------------------------------------------------------------

locret_C640:
		rts
; End of function sub_C5F2


; =============== S U B	R O U T	I N E =======================================


sub_C641:
		ldx	#byte_4500	; NOVRAM
		ldu	#Scratch_RAM_start

loc_C647:
		lda	,x+
		eora	,u+
		anda	#$F
		bne	locret_C65A
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_C647
		lda	#1
		sta	word_4AF6+1
		clra

locret_C65A:
		rts
; End of function sub_C641

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_C5F2

loc_C65B:
		leax	-1,x
		tfr	x, d
		std	word_4AF8
		lda	#$FF
		sta	word_4AF6+1
		ldx	#byte_4500	; NOVRAM
		ldu	#Scratch_RAM_start

loc_C66D:
		ldd	,u++
		std	,x++
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_C66D
		tst	word_4AF6+1
		rts
; END OF FUNCTION CHUNK	FOR sub_C5F2

; =============== S U B	R O U T	I N E =======================================


sub_C67A:
		ldx	#byte_4500	; NOVRAM
		ldd	#0

loc_C680:
		std	,x++
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_C680
		rts
; End of function sub_C67A


; =============== S U B	R O U T	I N E =======================================


sub_C688:
		ldx	#$7D0

loc_C68B:
		leax	-1,x
		bne	loc_C68B
		rts
; End of function sub_C688


; =============== S U B	R O U T	I N E =======================================


sub_C690:
		lda	word_4AF6+1
		beq	locret_C6B7
		cmpa	#1
		bne	loc_C69D
		ldb	#$9C ; 'ú'
		bra	loc_C6B4
; ---------------------------------------------------------------------------

loc_C69D:
		ldd	#$1F6A
		std	,y++
		ldd	#$1A4
		std	,y++
		lda	word_4AF8+1
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	#$8040
		std	,y++
		ldb	#$9D ; 'ù'

loc_C6B4:				; Print	text string from pointer table
		jsr	sub_E7C7

locret_C6B7:
		rts
; End of function sub_C690


; =============== S U B	R O U T	I N E =======================================


sub_C6B8:
		lda	#$FF
		sta	NVRecall
		jsr	sub_6005
		lda	#0
		sta	NVRecall
		ldu	#0

loc_C6C8:
		jsr	sub_6005
		leau	1,u
		cmpu	#$20 ; ' '
		bcs	loc_C6C8
		rts
; End of function sub_C6B8


; =============== S U B	R O U T	I N E =======================================

; Read NOVRAM

sub_C6D4:
		ldu	#$4AFA
; End of function sub_C6D4


; =============== S U B	R O U T	I N E =======================================

; Read NOVRAM

sub_C6D7:
		lda	#3

loc_C6D9:
		sta	word_4B02

loc_C6DC:
		lda	,x+
		asla
		asla
		asla
		asla
		sta	,u
		lda	,x+
		anda	#$F
		adda	,u
		sta	,u+
		dec	word_4B02
		bpl	loc_C6DC
		leax	-8,x
		rts
; End of function sub_C6D7


; =============== S U B	R O U T	I N E =======================================


sub_C6F4:
		ldu	#byte_4AFA
; End of function sub_C6F4


; =============== S U B	R O U T	I N E =======================================


sub_C6F7:
		lda	#2

loc_C6F9:
		sta	word_4B02

loc_C6FC:
		lda	,u+
		sta	1,x
		lsra
		lsra
		lsra
		lsra
		sta	,x++

loc_C706:
		dec	word_4B02
		bpl	loc_C6FC
		leax	-6,x
		rts
; End of function sub_C6F7


; =============== S U B	R O U T	I N E =======================================


sub_C70E:
		ldb	#0
		stb	<DPbyte_AD
		tfr	a, b
		lsra
		lsra
		lsra
		lsra
		cmpa	#$A
		bcs	loc_C71E
		lda	#9

loc_C71E:
		jsr	loc_E7AD
		lda	#$B8 ; '∏'
		sta	,y+
		lda	#$DF ; 'ﬂ'
		sta	,y+
		clra
		andb	#$F
		beq	loc_C734

loc_C72E:
		adda	#4
		daa
		decb
		bne	loc_C72E

loc_C734:				; Display BCD numbers
		jmp	Display_Vect_BCD
; End of function sub_C70E

; ---------------------------------------------------------------------------
byte_C737:	fcb 1, 3, 7, $F, 8, 0, 8, 0
		fcb 8, 0, 8, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0
byte_C797:	fcb 8, $80, $48, $B0, 9, $49, $89, $C1
		fcb $E4, $C4, $A4, $84
unk_C7A3:	fcb   0
word_C7A4:	fdb $50A, $1015, $1A20,	$252A, $3035, $3A40, $454A, $5055
		fdb $5A60
unk_C7B6:	fcb   0
word_C7B7:	fdb $834
		fcb $90	; ê
		fcb $98	; ò
word_C7BB:	fdb $1B8
		fdb $190
		fdb $168
word_C7C1:	fdb $118
word_C7C3:	fdb $140
word_C7C5:	fdb $B4
word_C7C7:	fdb $50
word_C7C9:	fdb $DC
word_C7CB:	fdb $78
word_C7CD:	fdb $1E6B, $1E98, $1EC5, $1EF2,	$1F1F, $1F4C, $1F79, $1FA6
		fdb $1FD3, $1E6B, $1E98, $1EC5,	$1EF2, $1F1F, $1F4C, $1F79
		fdb $1FA6, $1FD3
byte_C7F1:	fcb $74, $78, $7A, $7E,	$86, $8A, $8E, $92
		fcb $94, $96, $98, $9A

; =============== S U B	R O U T	I N E =======================================

; Display high scores

sub_C7FD:
		tst	word_4AEC
		bmi	loc_C811
		lda	#$3E ; '>'
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text
		ldd	#$7200
		std	,y++
		ldd	#word_CA64	; High scores text position table
		bra	loc_C81E
; ---------------------------------------------------------------------------

loc_C811:
		lda	#$3F ; '?'
		jsr	sub_D8DF	; Called from select screen, attract screen 1 +	3 when writing text
		ldd	#$7140		; High scores text size
		std	,y++
		ldd	#word_CA78

loc_C81E:
		std	word_4AF1
		lda	#0
		sta	word_4AEA

loc_C826:
		ldu	word_4AF1
		ldd	,u
		std	,y++
		ldd	#$1F80
		std	,y++
		ldb	word_4AEA
		aslb
		addb	word_4AEA
		ldx	#byte_4AB6
		abx
		cmpx	word_4AEC
		bne	loc_C847
		ldd	#$6780
		bra	loc_C84A
; ---------------------------------------------------------------------------

loc_C847:				; Attract text colour/intensity	for fading
		ldd	byte_4B10

loc_C84A:
		std	,y++
		std	<DPbyte_1
		ldu	#$3016
		tst	word_4AEC
		bmi	loc_C871
		lda	word_4AEE
		cmpa	#0
		bne	loc_C86D
		lda	word_4843
		anda	#1
		bne	loc_C869
		ldd	byte_4B10	; Attract text colour/intensity	for fading
		bra	loc_C86B
; ---------------------------------------------------------------------------

loc_C869:
		ldd	<DPbyte_1

loc_C86B:
		bra	loc_C86F
; ---------------------------------------------------------------------------

loc_C86D:
		ldd	<DPbyte_1

loc_C86F:
		std	,y++

loc_C871:
		lda	,x+
		bne	loc_C884
		tst	word_4AEC
		bmi	loc_C87F
		ldd	$3054
		bra	loc_C882
; ---------------------------------------------------------------------------

loc_C87F:
		ldd	$3002

loc_C882:
		bra	loc_C887
; ---------------------------------------------------------------------------

loc_C884:
		asla
		ldd	a,u

loc_C887:
		std	,y++
		tst	word_4AEC
		bmi	loc_C8A9
		lda	word_4AEE
		cmpa	#1
		bne	loc_C8A5
		lda	>word_4843
		anda	#1
		bne	loc_C8A1
		ldd	byte_4B10	; Attract text colour/intensity	for fading
		bra	loc_C8A3
; ---------------------------------------------------------------------------

loc_C8A1:
		ldd	<DPbyte_1

loc_C8A3:
		bra	loc_C8A7
; ---------------------------------------------------------------------------

loc_C8A5:
		ldd	<DPbyte_1

loc_C8A7:
		std	,y++

loc_C8A9:
		lda	,x+
		bne	loc_C8BC
		tst	word_4AEC
		bmi	loc_C8B7
		ldd	$3054
		bra	loc_C8BA
; ---------------------------------------------------------------------------

loc_C8B7:
		ldd	$3002

loc_C8BA:
		bra	loc_C8BF
; ---------------------------------------------------------------------------

loc_C8BC:
		asla
		ldd	a,u

loc_C8BF:
		std	,y++
		tst	word_4AEC
		bmi	loc_C8E1
		lda	word_4AEE
		cmpa	#2
		bne	loc_C8DD
		lda	>word_4843
		anda	#1
		bne	loc_C8D9
		ldd	byte_4B10	; Attract text colour/intensity	for fading
		bra	loc_C8DB
; ---------------------------------------------------------------------------

loc_C8D9:
		ldd	<DPbyte_1

loc_C8DB:
		bra	loc_C8DF
; ---------------------------------------------------------------------------

loc_C8DD:
		ldd	<DPbyte_1

loc_C8DF:
		std	,y++

loc_C8E1:
		lda	,x+
		bne	loc_C8F4
		tst	word_4AEC
		bmi	loc_C8EF
		ldd	$3054
		bra	loc_C8F2
; ---------------------------------------------------------------------------

loc_C8EF:
		ldd	$3002

loc_C8F2:
		bra	loc_C8F7
; ---------------------------------------------------------------------------

loc_C8F4:
		asla
		ldd	a,u

loc_C8F7:
		std	,y++
		ldd	<DPbyte_1
		std	,y++
		ldd	#$8040
		std	,y++
		ldu	word_4AF1
		ldd	,u
		std	,y++
		ldd	#$1F38
		std	,y++
		lda	word_4AEA
		inca
		cmpa	#$A
		bcs	loc_C918
		lda	#$10

loc_C918:
		ldb	#1
		stb	<DPbyte_AD
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	#$B8DC
		std	,y++
		ldd	#$8040
		std	,y++
		ldb	word_4AEA
		aslb
		aslb
		ldx	#byte_4A8E	; High scores RAM
		abx
		ldu	word_4AF1
		ldd	,u++
		std	,y++
		ldd	#$1FF0
		std	,y++
		stu	word_4AF1
		ldb	#6
		stb	<DPbyte_AD
		jsr	sub_E764
		leax	4,x
		ldd	#$8040
		std	,y++
		inc	word_4AEA
		lda	word_4AEA
		cmpa	#$A
		lbcs	loc_C826
		ldd	#$7200
		std	,y++
		ldd	word_4AEC
		bpl	loc_C966
		rts
; ---------------------------------------------------------------------------

loc_C966:
		ldd	#$6480
		std	,y++
		ldx	#(word_CBA6+2)
		ldu	#$3018

loc_C971:
		ldd	2,x
		anda	#$1F
		std	,y++
		ldd	,x
		anda	#$1F
		std	,y++
		ldd	,u++
		std	,y++
		ldd	#$8040
		std	,y++
		leax	4,x
		cmpx	#word_CC10
		bcs	loc_C971
		ldd	word_CBA6
		anda	#$1F
		std	,y++
		ldd	word_CBA4
		anda	#$1F
		std	,y++
		ldd	$3054
		std	,y++
		ldd	#$7200
		std	,y++
		ldd	#$8040
		std	,y++
		ldb	word_4AEE+1
		cmpb	#$1B
		bne	loc_C9B6
		ldd	#$6750
		bra	loc_C9B9
; ---------------------------------------------------------------------------

loc_C9B6:
		ldd	#$6450

loc_C9B9:
		std	,y++
		ldd	2,x
		anda	#$1F
		std	,y++
		ldd	,x
		subd	#8
		anda	#$1F
		std	,y++
		ldd	#$71C0
		std	,y++
		ldd	$303A
		std	,y++
		ldd	$3040
		std	,y++
		ldd	$301A
		std	,y++
		ldd	#$7200
		std	,y++
		ldd	#$8040
		std	,y++
		ldb	word_4AEE+1
		cmpb	#$1C
		bne	loc_C9F4
		ldd	#$6750
		bra	loc_C9F7
; ---------------------------------------------------------------------------

loc_C9F4:
		ldd	#$6450

loc_C9F7:
		std	,y++
		ldd	6,x
		anda	#$1F
		std	,y++
		ldd	4,x
		subd	#8
		anda	#$1F
		std	,y++
		ldd	#$71C0
		std	,y++
		ldd	$3020
		std	,y++
		ldd	$3032
		std	,y++
		ldd	$301E
		std	,y++
		ldd	#$7200
		std	,y++
		ldd	#$8040
		std	,y++
		ldd	#$6780
		std	,y++
		ldb	word_4AEE+1
		cmpb	#$1B
		bcc	loc_CA5B
		aslb
		aslb
		ldx	#word_CBA4
		abx
		ldd	2,x
		anda	#$1F
		std	,y++
		ldd	,x
		anda	#$1F
		std	,y++
		ldb	word_4AEE+1
		bne	loc_CA4E
		ldd	$3054
		bra	loc_CA54
; ---------------------------------------------------------------------------

loc_CA4E:
		aslb
		ldx	#$3016
		ldd	b,x

loc_CA54:
		std	,y++
		ldd	#$8040		; Vector CNTR instruction
		std	,y++

loc_CA5B:
		ldd	#$6680
		std	,y++
		jsr	sub_B6CC
		rts
; End of function sub_C7FD

; ---------------------------------------------------------------------------
word_CA64:	fdb $1FB8, $1F94, $1F72, $1F42,	$1F1E, $1EFC, $1ED8, $1EB6
		fdb $1E92, $1E6E
word_CA78:	fdb $8C, $64, $3C, $14,	$1FEC, $1FC4, $1F9C, $1F74
		fdb $1F4C, $1F24

; =============== S U B	R O U T	I N E =======================================

; Score

sub_CA8C:
		ldx	#byte_4A8E	; High scores RAM

loc_CA8F:				; Score	millions
		ldd	<DPbyte_5C
		subd	,x
		bhi	loc_CAA5
		bne	loc_CA9D
		ldd	<DPbyte_5E	; Score	thousands
		subd	2,x
		bcc	loc_CAA5

loc_CA9D:
		leax	4,x
		cmpx	#byte_4AB6
		bcs	loc_CA8F
		rts
; ---------------------------------------------------------------------------

loc_CAA5:
		jsr	sub_CAB7
		lda	#0
		sta	word_4AEE
		ldd	#0
		std	word_4AEE+1
		ldx	#byte_4AB6
		rts
; End of function sub_CA8C


; =============== S U B	R O U T	I N E =======================================


sub_CAB7:
		stx	word_4AEC
		ldu	#byte_4AD1
		ldx	#byte_4AB2
		cmpx	word_4AEC
		beq	loc_CADE

loc_CAC5:
		ldd	-4,x
		std	,x
		ldd	-2,x
		std	2,x
		ldd	-3,u
		std	,u
		lda	-1,u
		sta	2,u
		leau	-3,u
		leax	-4,x
		cmpx	word_4AEC
		bhi	loc_CAC5

loc_CADE:
		stu	word_4AEC
		lda	#0
		sta	,u
		ldd	#0
		std	1,u
		ldd	<DPbyte_5C	; Score	millions
		std	,x
		ldd	<DPbyte_5E	; Score	thousands
		std	2,x
		rts
; End of function sub_CAB7


; =============== S U B	R O U T	I N E =======================================


sub_CAF3:
		ldx	word_4AEC
		ldb	word_4AEE
		abx
		tfr	x, u
		lda	word_4AEE
		cmpa	#3
		bcs	loc_CB08
		ldx	#word_CC10
		bra	loc_CB0B
; ---------------------------------------------------------------------------

loc_CB08:
		ldx	#word_CBA4

loc_CB0B:
		ldd	>byte_4879
		subd	#8
		subd	,x
		tsta
		bpl	loc_CB1A
		coma
		negb
		sbca	#$FF

loc_CB1A:
		std	<DPbyte_1
		cmpd	#$18
		bcc	loc_CB49
		ldd	>word_487B
		addd	#$FF8C
		subd	2,x
		tsta
		bpl	loc_CB31
		coma
		negb
		sbca	#$FF

loc_CB31:
		cmpd	#$18
		bcc	loc_CB49
		addd	<DPbyte_1
		cmpd	#$20 ; ' '
		bcc	loc_CB49
		tfr	x, d
		subd	#word_CBA4
		lsrb
		lsrb
		stb	word_4AEE+1

loc_CB49:
		leax	4,x
		cmpx	#word_CC10+8
		bcs	loc_CB0B
		lda	word_4AEE+1
		cmpa	#$1B
		bcc	loc_CB59
		sta	,u

loc_CB59:
		lda	<DPbyte_AC
		anda	#$F0 ; ''
		beq	locret_CBA3
		lda	word_4AEE+1
		cmpa	#$1B
		bne	loc_CB82
		lda	word_4AEE
		cmpa	#2
		bhi	loc_CB71
		lda	#0
		sta	,u

loc_CB71:
		lda	word_4AEE
		beq	loc_CB7D
		dec	word_4AEE
		lda	#0
		sta	-1,u

loc_CB7D:
		jsr	Sound_34
		bra	locret_CBA3
; ---------------------------------------------------------------------------

loc_CB82:
		cmpa	#$1C
		bne	loc_CB91
		ldd	#$FFFF
		std	word_4AEC
		jsr	Sound_2D
		bra	locret_CBA3
; ---------------------------------------------------------------------------

loc_CB91:
		inc	word_4AEE
		lda	word_4AEE
		cmpa	#3
		bcs	loc_CBA0
		lda	#$1C
		sta	word_4AEE+1

loc_CBA0:
		jsr	Sound_3A

locret_CBA3:
		rts
; End of function sub_CAF3

; ---------------------------------------------------------------------------
word_CBA4:	fdb $11C
word_CBA6:	fdb $FF44, $FEDC, $FFA4, $FEDC,	$FF74, $FEDC, $FF44, $FEDC
		fdb $FF14, $FEDC, $FEE4, $FEDC,	$FEB4, $FEDC, $FE84, $FEDC
		fdb $FE54, $FEDC, $FE24, $FF0C,	$FE24, $FF3C, $FE24, $FF6C
		fdb $FE24, $FF9C, $FE24, $FFCC,	$FE24, $FFFC, $FE24, $2C
		fdb $FE24, $5C,	$FE24, $8C, $FE24, $BC,	$FE24, $EC
		fdb $FE24, $11C, $FE24,	$11C, $FE54, $11C, $FE84, $11C
		fdb $FEB4, $11C, $FEE4,	$11C, $FF14
word_CC10:	fdb $11C, $FF74, $11C, $FFA4

; =============== S U B	R O U T	I N E =======================================


sub_CC18:
		jsr	sub_CC5B
		lda	#1
		jsr	sub_C2C3
		bne	loc_CC38
		ldu	#byte_4AB6
		ldx	#byte_4520
		lda	#8
		jsr	loc_C6D9
		ldu	#byte_4A8E	; High scores RAM
		ldx	#byte_4508
		lda	#$B
		jsr	loc_C6D9

loc_CC38:
		ldx	#byte_4AB6

loc_CC3B:
		lda	,x+
		cmpa	#$1B
		bcc	sub_CC5B
		cmpx	#word_4AD4
		bcs	loc_CC3B
		ldx	#byte_4A8E	; High scores RAM

loc_CC49:
		lda	,x+
		cmpa	#$A0 ; '†'
		bcc	sub_CC5B
		anda	#$F
		cmpa	#$A
		bcc	sub_CC5B
		cmpx	#byte_4AB6
		bcs	loc_CC49
		rts
; End of function sub_CC18


; =============== S U B	R O U T	I N E =======================================


sub_CC5B:
		ldx	#byte_4AB6
		ldu	#word_CC7A	; High score names

loc_CC61:
		ldd	,u++
		std	,x++
		cmpx	#word_4AD4
		bcs	loc_CC61
		ldx	#byte_4A8E	; High scores RAM
		ldu	#word_CC98	; High scores init table

loc_CC70:
		ldd	,u++
		std	,x++
		cmpx	#byte_4AB6
		bcs	loc_CC70
		rts
; End of function sub_CC5B

; ---------------------------------------------------------------------------
word_CC7A:	fdb $F02, $917,	$10E, $801, $E07, $A12,	$D0C, $80A ; High score	names
		fdb $504, $E0C,	$105, $A04, $501, $1212, $C0D
word_CC98:	fdb $128, $5353, $111, $936, $102, $4650, $87, $2551 ; High scores init	table
		fdb $81, $3553,	$70, $4899, $51, $8000,	$49, $2159
		fdb $38, $4766,	$38, $655

; =============== S U B	R O U T	I N E =======================================

; Initialise object?

sub_CCC0:
		orcc	#1
		ror	MPAGE
		jsr	$670D
		clr	MPAGE
		rts
; End of function sub_CCC0


; =============== S U B	R O U T	I N E =======================================

; Copy XYZ data	to math	RAM

sub_CCCC:
		orcc	#1
		ror	MPAGE
		jsr	$6724
		clr	MPAGE
		rts
; End of function sub_CCCC


; =============== S U B	R O U T	I N E =======================================

; Copy object 3D data to math ram

sub_CCD8:
		orcc	#1
		ror	MPAGE
		jsr	$6726
		clr	MPAGE
		rts
; End of function sub_CCD8


; =============== S U B	R O U T	I N E =======================================


sub_CCE4:
		orcc	#1
		ror	MPAGE		; Change memory	page
		jsr	$6761
		clr	MPAGE
		rts
; End of function sub_CCE4


; =============== S U B	R O U T	I N E =======================================

; Get divider result and multiply by Math result Z, insert VCTR	instruction

sub_CCF0:
		orcc	#1
		ror	MPAGE
		jsr	$6761
		clr	MPAGE
		rts
; End of function sub_CCF0


; =============== S U B	R O U T	I N E =======================================

; Trench floor lines calcs

sub_CCFC:
		orcc	#1
		ror	MPAGE
		jsr	$6782
		clr	MPAGE
		rts
; End of function sub_CCFC


; =============== S U B	R O U T	I N E =======================================

; Trench side vertical lines calcs

sub_CD08:
		orcc	#1
		ror	MPAGE
		jsr	$67AA
		clr	MPAGE
		rts
; End of function sub_CD08


; =============== S U B	R O U T	I N E =======================================

; Math program 0x50. Matrix Multiply - Transposed
; Then do perspective division?

sub_CD14:
		orcc	#1
		ror	MPAGE
		jsr	$67D2
		clr	MPAGE
		rts
; End of function sub_CD14


; =============== S U B	R O U T	I N E =======================================

; Do 3D	object transform using Matrix 1

sub_CD20:
		orcc	#1
		ror	MPAGE
		jsr	$67D4
		clr	MPAGE
		rts
; End of function sub_CD20


; =============== S U B	R O U T	I N E =======================================

; Format vectors for ties, and tower/bunker explosions

sub_CD2C:
		orcc	#1
		ror	MPAGE
		jsr	$6819
		clr	MPAGE
		rts
; End of function sub_CD2C


; =============== S U B	R O U T	I N E =======================================

; Trench left side turret calcs

sub_CD38:
		orcc	#1
		ror	MPAGE
		jsr	$6864
		clr	MPAGE
		rts
; End of function sub_CD38


; =============== S U B	R O U T	I N E =======================================

; Trench right side turret calcs

sub_CD44:
		orcc	#1
		ror	MPAGE
		jsr	$68C7
		clr	MPAGE
		rts
; End of function sub_CD44


; =============== S U B	R O U T	I N E =======================================


sub_CD50:
		orcc	#1		; Called during	towers
		ror	MPAGE
		jsr	$692D
		clr	MPAGE
		rts
; End of function sub_CD50


; =============== S U B	R O U T	I N E =======================================

; Trench calcs

sub_CD5C:
		orcc	#1		; Called during	trench start
		ror	MPAGE
		jsr	$6978
		clr	MPAGE
		rts
; End of function sub_CD5C


; =============== S U B	R O U T	I N E =======================================


sub_CD68:
		orcc	#1		; Called during	towers
		ror	MPAGE
		jsr	$6A0C
		clr	MPAGE
		rts
; End of function sub_CD68


; =============== S U B	R O U T	I N E =======================================

; Function select for an object

sub_CD74:
		orcc	#1
		ror	MPAGE
		jsr	$6AA0
		clr	MPAGE
		rts
; End of function sub_CD74


; =============== S U B	R O U T	I N E =======================================

; Starfield

sub_CD80:
		orcc	#1		; Starfield attract screen 1 + 3 + 4
		ror	MPAGE
		jsr	$7D9A
		clr	MPAGE
		rts
; End of function sub_CD80


; =============== S U B	R O U T	I N E =======================================

; Towers surface dots

sub_CD8C:
		orcc	#1
		ror	MPAGE
		jsr	$7EAF
		clr	MPAGE
		rts
; End of function sub_CD8C


; =============== S U B	R O U T	I N E =======================================

; Unused

sub_CD98:
		asra
		rorb
		asra
		rorb
; End of function sub_CD98


; =============== S U B	R O U T	I N E =======================================

; Shift	D register right

Shift_D_R_6:
		asra
		rorb
; End of function Shift_D_R_6


; =============== S U B	R O U T	I N E =======================================

; Shift	D register right

Shift_D_R_5:
		asra
		rorb

Shift_D_R_4:
		asra
		rorb

Shift_D_R_3:
		asra
		rorb
		asra
		rorb
		asra
		rorb
		rts
; End of function Shift_D_R_5


; =============== S U B	R O U T	I N E =======================================

; Shift	D register left

sub_CDA9:
		aslb
		rola
; End of function sub_CDA9


; =============== S U B	R O U T	I N E =======================================


Shift_D_L_7:
		aslb
		rola
		aslb
		rola
		aslb
		rola

Shift_D_L_4:
		aslb
		rola
		aslb
		rola

Shift_D_L_2:
		aslb
		rola
		aslb
		rola
		rts
; End of function Shift_D_L_7


; =============== S U B	R O U T	I N E =======================================

; Do math program run

Math_Run_Start:
		sta	MW0

Math_Wait_Til_Halt:
		tst	IO_Port_1
		bmi	Math_Wait_Til_Halt
		rts
; End of function Math_Run_Start


; =============== S U B	R O U T	I N E =======================================

; Initialise math registers matrix

sub_CDC3:
		ldd	#0
		std	-$A,u
		std	-2,u
		std	6,u
		std	8,u
		std	$A,u
		std	$C,u
		std	-$E,u
		std	-$C,u
		std	-8,u
		std	-4,u
		std	,u
		std	2,u
		lda	#$40 ; '@'
		std	-$10,u
		std	-6,u
		std	4,u
		rts
; End of function sub_CDC3


; =============== S U B	R O U T	I N E =======================================

; Swap Matrix 2	 x, y, z to  x,	y, z

sub_CDE7:
		ldd	MReg15		; Ay2
		ldu	MReg18		; Bx2
		std	MReg18		; Bx2
		stu	MReg15		; Ay2
		ldd	MReg16		; Az2
		ldu	MReg1C		; Cx2
		std	MReg1C		; Cx2
		stu	MReg16		; Az2
		ldd	MReg1A		; Bz2
		ldu	MReg1D		; Cy2
		std	MReg1D		; Cy2
		stu	MReg1A		; Bz2
		rts
; End of function sub_CDE7


; =============== S U B	R O U T	I N E =======================================

; Copy transform data from [BIC] to matrix 2

sub_CE0C:
		sta	MW2
		clr	MW1
		lda	#$77 ; 'w'
		jsr	Math_Run_Start	; Do math program run
		rts
; End of function sub_CE0C


; =============== S U B	R O U T	I N E =======================================

; Run math program $80 Copy [BIC] to Matrix 3

sub_CE18:
		sta	MW2
		clr	MW1
		lda	#$80 ; 'Ä'
		jsr	Math_Run_Start	; Do math program run
		rts
; End of function sub_CE18


; =============== S U B	R O U T	I N E =======================================

; Run math program $00 Roll

sub_CE24:
		ldd	#$10
		std	MW1		; Point	BIC to $5080 MReg40 Matrix 4
		lda	#0
		jmp	Math_Run_Start	; Do math program run
; End of function sub_CE24


; =============== S U B	R O U T	I N E =======================================

; Run math program $0E Pitch

sub_CE2F:
		ldd	#$10
		std	MW1		; Point	BIC to $5080 MReg40 Matrix 4
		lda	#$E
		jmp	Math_Run_Start	; Do math program run
; End of function sub_CE2F


; =============== S U B	R O U T	I N E =======================================

; Run math program $1C Yaw

sub_CE3A:
		ldd	#$10
		std	MW1		; Point	BIC to $5080 MReg40 Matrix 4
		lda	#$1C
		jmp	Math_Run_Start	; Do math program run
; End of function sub_CE3A


; =============== S U B	R O U T	I N E =======================================

; Update random	numbers

Gen_Random:
		ldd	<DPbyte_53
		std	<DPbyte_54
		lda	PRNG
		sta	<DPbyte_53
		rts
; End of function Gen_Random

; ---------------------------------------------------------------------------
		fcb $13, $D8, $35, $8F,	4
aUrfeyGotWired:	fcc "ƒURFEY GOT WIRED"
		fcb $A7, $3E, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF
aCopyright1983Atari:fcc	"COPYRIGHT 1983 ATARI"
word_CEDE:	fdb $1AF6, $1DA8, 0, $E208, $1F7E, $E000, 0, $FF74 ; Attract screen 2 "Star Wars" logo vector data
		fdb $BB91, $1EC0, $FFCE, $BB8B,	0, $FF4C, $BB91, $140
		fdb $E050, 0, $FF4C, $51FB, $1FEC, $E032, $1FA6, $E032
		fdb $BB91, $1FB0, $FFEC, $BB91,	$1F9C, $FF88, $BB8B, 0
		fdb $FE0C, $BB8B, $8C, $E05A, 0, $E140,	$4AE5, $14
		fdb $FFD8, $BB85, $5A, $FFCE, $BB8B, $50, $E028, $64
		fdb $E082, $7200, $8040, $C000,	$1AF6, $B4, $1E3E, $E0B4
		fdb $BB8B, 0, $FF60, $BB8B, $46, $FFE2,	$BB8E, 0
		fdb $FF56, $BB91, $1FBA, $FFF6,	$BB91, 0, $FF60, $BB8B
		fdb $1C2, $E078, 0, $E0E6, $1F88, $1F92, $BB8B,	$1F74
		fdb $E046, 0, $FF92, $8C, $E028, $7200,	$8040, $C000
		fdb $1AF6, $226, 0, $FEE8, $BB91, $1E3E, $E05A,	0
		fdb $E0AA, $BB8E, $8C, $FFD8, $1F74, $E122, $BB8B, 0
		fdb $E154, $BB8B, $8C, $FFA6, 0, $FEF2,	$14, $FFD8
		fdb $3C, $E03C,	$BB88, $6E, $FFCE, $78,	$FF4C, $1F88
		fdb $A,	$BB88, $1FD8, $E03C, $56E5, $1FCE, $FFD8, 0
		fdb $FF7E, $6E,	$FFD8, 0, $E08C, $7200,	$8040, $C000
		fdb $18BC, $1C4A, $BB9A, $1F24,	$FFBA, $DC, $E0A0, 0
		fdb $E08C, $BB9A, $1F24, $FFBA,	$DC, $E0AA, 0, $E08C
		fdb $BB9D, $1DE4, $FEE8, $BBA3,	0, $FF10, $BBA3, $96
		fdb $E032, $1F6A, $FF7E, $BBA3,	0, $FF10, $BBA3, $21C
		fdb $E0B4, 0, $E0BE, $7200, $8040, $C000, $18BC, $1FB0
		fdb $1DE4, $E082, $BBA3, 0, $FF38, $BBA3, $50, $FFE2
		fdb $BBA3, 0, $FF2E, $BBA3, $1FB0, $FFC4, $BBA3, 0
		fdb $FF24, $BBA3, $21C,	$E118, 0, $E136, $1F88,	$1F56
		fdb $BBA0, $1F2E, $E03C, 0, $FF56, $D2,	$E06E, $7200
		fdb $8040, $C000, $18BC, $19A, 0, $FE84, $1DE4,	$E00A
		fdb 0, $E0C8, $BBA3, $B4, $FFEC, $1F4C,	$E154, $BBA3
		fdb 0, $E258, $BBA3, $78, $E078, $BBA3,	$6E, $FFC4
		fdb $78, $FF1A,	$14, $FFA6, $28, $FFEC,	0, $E168
		fdb $BB9D, $82,	$FFB0, 0, $FE70, $1F9C,	$FF9C, $BB9A
		fdb $1F9C, $E028, $BB9D, $1F92,	$E0BE, $BB94, $1FEC, $E050
		fdb $51E5, 0, $FEE8, $1E, $FF42, $50, $E08C, $BB97
		fdb $82, $FFD8,	$78, $FF38, $1F88, $1FCE, $BB9A, $1FC4
		fdb $E064, $1FD8, $E00A, $1FE2,	$FFB0, 0, $FF2E, $82
		fdb $FFF6, 0, $E0BE, $7200, $8040, $C000, $64FF, $78
		fdb $E00A, $1FD3, $1E, $1FB5, $FFD8, $3C, $E04B, $A018
		fdb $A016, $64FF, $1FD3, $1FFB,	$1FF1, $FFBA, $1FD3, $E050
		fdb $A018, $A016, $64FF, $1FD3,	$1FEC, $5A, $FFC4, $1FB5
		fdb $E01E, $5116, $69, $FFF6, $1F88, $FFE2, $A018, $A016
		fdb $64FF, $2D,	$1FF6, $4B, $E028, $1FC4, $FFC4, $2D
		fdb $A,	$F, $E032, $F, $FFB0, $A018, $A016, $64FF
		fdb $2D, 0, $1FC4, $E050, $3C, $FFE2, $3C, 0
		fdb $A018, $A016, $64FF, $1F88,	$E01E, $A018, $A016, $64FF
		fdb $C000, $64FF, $5A, $E00F, $1FF1, $F, $1FB5,	$FFE2
		fdb $2D, $E050,	$A018, $A016, $64FF, $1FCC, 5, 7
		fdb $FFAB, $1FB5, $E046, $A018,	$A016, $64FF, $1FF1, $1FCE
		fdb $5A, $FFEC,	$1F88, $E000, $4F16, $5A, $E014, $1F90
		fdb $FFCE, $A018, $A016, $64FF,	$3C, $1FF1, $34, $E041
		fdb $1FE2, $FFB0, $2D, $14, $1FF1, $E03C, $2D, $FFB0
		fdb $A018, $A016, $64FF, $4F05,	$1FB5, $E046, $5A, $FFE2
		fdb $25, $1E, $A018, $A016, $64FF, $1F81, $E000, $A018
		fdb $A016, $64FF, $C000, $64FF,	$5A, $E00A, $4B0F, $A018
		fdb $A016, $64FF, $1F90, $FFD8,	$4B, $E03C, $1FD3, $1FF6
		fdb $1FE2, $FFCE, $F, $E055, $A018, $A016, $64FF, $1FE2
		fdb $1FF1, $F, $FFBA, $1FC4, $E046, $1FD3, $1FEC, $A018
		fdb $A016, $64FF, $69, $FFCE, $1F97, $FFF6, $4F16, $4B
		fdb $E01E, $1FA6, $FFBA, $26, $1FF6, $A018, $A016, $64FF
		fdb $34, $E050,	$1FF1, $FFA6, $2D, $28,	$1FE2, $E032
		fdb $5A, $FFC4,	$A018, $A016, $64FF, $2D, $32, $1F79
		fdb $E00A, $A018, $A016, $64FF,	$C000, $64FF, $1F81, $E00F
		fdb $A018, $A016, $64FF, $34, $19, $4B,	$FFD8, $1FB5
		fdb $E03C, $35,	5, $16,	$FFBF, $1FF1, $E055, $A018
		fdb $A016, $64FF, $2D, $1FF1, $1FE2, $FFBA, $4B, $E046
		fdb $16, $1FF1,	$A018, $A016, $64FF, $1F9F, $FFC9, $69
		fdb $FFF1, $4011, $A018, $A016,	$64FF, $1F97, $E02D, $4B
		fdb $FFBA, $1FDA, $1FF6, $1FDB,	$E050, 0, $FFAB, $A018
		fdb $A016, $64FF, $1FE2, $23, $1E, $E032, $1FA6, $FFC4
		fdb $1FE2, $28,	$78, $E014, $A018, $A016, $64FF, $C000
		fdb $4FE0, 0, $3C, $1FE2, $FFC4, $1FE2,	$E028, $1FE2
		fdb $1FD8, $3C,	$E000, $1FE2, $FFD8, $5A, 0, $1FC4
		fdb $E028, $C000, $40F6, $5A, 0, $1FA6,	$E014, $3C
		fdb $E014, $1FC4, $14, 0, $FFD8, $1FC4,	$E014, 0
		fdb $1FC4, $3C,	$E028, $C000, $51E0, 0,	$1FC4, $1E
		fdb $E03C, $1E,	$FFD8, $1E, $28, $1FC4,	$E000, $1E
		fdb $E028, $1FA6, 0, $3C, $FFD8, $C000,	$40EA, $1FA6
		fdb 0, $5A, $FFEC, $1FC4, $FFEC, $3C, $1FEC, 0
		fdb $E028, $3C,	$FFEC, 0, $3C, $1FC4, $FFD8, $C000
		fdb $441A, $B9EF, $5622, $B9EF,	$422A, $B9EF, $4604, $C000
		fdb $4604, $B9EF, $5E36, $F671,	$5C06, $4A3E, $F679, $4105
		fdb $B9EF, $5F3B, $B9EF, $F67C,	$5C06, $453F, $B9EF, $5F3B
		fdb $B9EF, $F678, $5C06, $4A3E,	$B9EF, $5E16, $F671, $B9EF
		fdb $5B01, $B9EF, $4A3E, $B9EF,	$5F1B, $B9EF, $422A, $B9EF
		fdb $5C06, $C000, $B9EF, $5A1C,	$B9EF, $422A, $B9EF, $5F1B
		fdb $F691, $5A1C, $B9EF, $4A3E,	$B9EF, $422A, $B9EF, $5917
		fdb $B9EF, $4125, $B9EF, $420A,	$C000, $5C06, $B9EF, $5E36
		fdb $F6A2, $5F1B, $4729, $B9EF,	$5E16, $B9EF, $5622, $B9EF
		fdb $420A, $B9EF, $4335, $B9EF,	$F6D2, $B9EF, $5F1B, $422A
		fdb $B9EF, $453F, $B9EF, $5E36,	$F6B5, $B9EF, $5A1C, $B9EF
		fdb $453F, $B9EF, $4624, $B9EF,	$5C26, $B9EF, $5B21, $B9EF
		fdb $451F, $5E36, $430F, $C000,	$5A1C, $B9EF, $4A3E, $B9EF
		fdb $4125, $B9EF, $5C26, $B9EF,	$5A3C, $B9EF, $5F3B, $480E
		fdb $C000, $5A1C, $B9EF, $4A3E,	$B9EF, $582C, $F71A, $B9EF
		fdb $5A1C, $B9EF, $4A3E, $B9EF,	$5B01, $B9EF, $422A, $B9EF
		fdb $451F, $F6F9, $5A1C, $B9EF,	$4A3E, $B9EF, $5C26, $B9EF
		fdb $4624, $B9EF, $5622, $F675,	$B9EF, $5A1C, $B9EF, $422A
		fdb $B9EF, $453F, $B9EF, $5E36,	$B9EF, $453F, $B9EF, $422A
		fdb $F725, $441A, $B9EF, $5B21,	$B9EF, $5C26, $B9EF, $4624
		fdb $B9EF, $453F, $F725, $441A,	$B9EF, $5622, $B9EF, $4624
		fdb $B9EF, $5C26, $B9EF, $4A3E,	$F725, $5B01, $B9EF, $453F
		fdb $B9EF, $443A, $B9EF, $5C06,	$4624, $B9EF, $5C06, $C000
		fdb $96, $1F9C,	$B6F2, $B6C5, $B71D, $1FBE, $1FD8, $B68F
		fdb $B6E7, $B6AD, $1FA6, $1FB0,	$B6A1, $B67C, $B6BD, $B678
		fdb $B6AD, $7200, $8040, $C000,	$1E, $1F9C, $B6F2, $B6C5
		fdb $B6BD, $B684, $B67C, $B670,	$B69A, $B6E1, $7200, $8040
		fdb $C000, $5A,	$1FB0, $B6BD, $B69A, $B709, $B6AD, $B6BD
		fdb $B6C5, $7200, $8040, $C000,	$96, $1FC4, $B6E7, $B6C5
		fdb $B670, $B670, $B71D, $7200,	$8040, $C000, $1FA0, $1FB0
		fdb $B67F, $B6AD, $1FDA, $14, $B713, $B69A, $B68F, $B6E7
		fdb $1FAE, $1F9C, $B71D, $B67C,	$B68A, $7200, $8040, $C000
		fdb $1F88, $1FB0, $B6C5, $B709,	$B6AD, $B670, $B670, $B6C5
		fdb $B6BD, $7200, $8040, $C000,	$1F5E, $1FC4, $B709, $B69A
		fdb $B678, $B6B1, $B6AD, $B6BD,	$B6FC, $7200, $8040, $C000
		fdb $1F2E, $1FD8, $B6D4, $B68A,	$B6BD, $B6A1, $B6AD, $B71D
		fdb $7200, $8040, $C000
word_D604:	fdb $61FF		; Vector colour	cycle table full brightness
		fdb $62FF
		fdb $63FF
		fdb $64FF
		fdb $65FF
		fdb $66FF
		fdb $67FF
word_D612:	fdb $6180		; Vector colour	cycle table normal brightness
		fdb $6280
		fdb $6380
		fdb $6480
		fdb $6580
		fdb $6680
		fdb $6780
word_D620:	fdb $F917
		fdb $F919
		fdb $F91B
		fdb $F91D
		fdb $F91F
		fdb $F921
		fdb $F923
		fdb $F925
		fdb $F927
		fdb $F929
		fdb $F92B
		fdb $F92D
		fdb $F92F
		fdb $F931
		fdb $F933
		fdb $F935
word_D640:	fdb $F937
		fdb $F939
		fdb $F93B
		fdb $F93D
word_D648:	fdb $F51E
		fdb $F561
		fdb $F5A3
		fdb $F5E5
word_D650:	fdb $F93F
		fdb $F94F
		fdb $F95F
		fdb $F96F
word_D658:	fdb $F628
		fdb $F63A
		fdb $F64C
		fdb $F65E

; =============== S U B	R O U T	I N E =======================================


sub_D660:
		jsr	sub_D68D	; Point	U to vector RAM	$38
		jsr	sub_D690	; Animate laser	target hit
		ldd	#$C000		; Vector RTSL instruction
		std	,u++
		jsr	sub_D6A0
		jsr	sub_D6A3
		ldd	#$C000
		std	,u++
		jsr	sub_D6BC
		jsr	sub_D6BF
		ldd	#$C000
		std	,u++
		jsr	sub_D6E7
		jsr	sub_D6EA
		ldd	#$C000
		std	,u++
		rts
; End of function sub_D660


; =============== S U B	R O U T	I N E =======================================

; Point	U to vector RAM	$38

sub_D68D:
		ldu	#$38 ; '8'
; End of function sub_D68D


; =============== S U B	R O U T	I N E =======================================

; Animate laser	target hit

sub_D690:
		jsr	sub_D709	; Laser	target animation
		ldd	,x++
		std	,u++
		ldd	,x++
		std	,u++
		ldd	,x
		std	,u++
		rts
; End of function sub_D690


; =============== S U B	R O U T	I N E =======================================


sub_D6A0:
		ldu	#$46 ; 'F'
; End of function sub_D6A0


; =============== S U B	R O U T	I N E =======================================


sub_D6A3:
		jsr	sub_D709	; Laser	target animation
		ldd	,x++
		negb
		andb	#$1F
		std	,u++
		ldd	,x++
		negb
		orb	#$E0 ; '‡'
		std	,u++
		ldd	,x
		negb
		andb	#$1F
		std	,u++
		rts
; End of function sub_D6A3


; =============== S U B	R O U T	I N E =======================================


sub_D6BC:
		ldu	#$54 ; 'T'
; End of function sub_D6BC


; =============== S U B	R O U T	I N E =======================================


sub_D6BF:
		jsr	sub_D709	; Laser	target animation
		ldd	,x++
		nega
		anda	#$1F
		ora	#$40 ; '@'
		negb
		andb	#$1F
		std	,u++
		ldd	,x++
		nega
		anda	#$1F
		ora	#$40 ; '@'
		negb
		orb	#$E0 ; '‡'
		std	,u++
		ldd	,x
		nega
		anda	#$1F
		ora	#$40 ; '@'
		negb
		andb	#$1F
		std	,u++
		rts
; End of function sub_D6BF


; =============== S U B	R O U T	I N E =======================================


sub_D6E7:
		ldu	#$62 ; 'b'
; End of function sub_D6E7


; =============== S U B	R O U T	I N E =======================================


sub_D6EA:
		jsr	sub_D709	; Laser	target animation
		ldd	,x++
		nega
		anda	#$1F
		ora	#$40 ; '@'
		std	,u++
		ldd	,x++
		nega
		anda	#$1F
		ora	#$40 ; '@'
		std	,u++
		ldd	,x
		nega
		anda	#$1F
		ora	#$40 ; '@'
		std	,u++
		rts
; End of function sub_D6EA


; =============== S U B	R O U T	I N E =======================================

; Laser	target animation

sub_D709:
		lda	PRNG		; Get random number
		anda	#$F		; Mask 0-15
		ldb	#6
		mul			; Multiply by 6	for 0- 90 range
		ldx	#word_D716	; Table	of vector SVEC instructions for	laser hit target animation
		abx			; Point	X reg to word from table
		rts
; End of function sub_D709

; ---------------------------------------------------------------------------
word_D716:	fdb $4200, $4DE1, $511F, $4601,	$46E1, $541E, $4902, $43E1 ; Table of vector SVEC instructions for laser hit target animation
		fdb $541D, $4301, $4CE3, $511C,	$4201, $48E4, $561B, $4302
		fdb $48E6, $5518, $4504, $43E2,	$581A, $4605, $45E4, $5517
		fdb $4202, $46E6, $5818, $4405,	$44E5, $5816, $4203, $48EC
		fdb $5611, $4102, $45EA, $5A14,	$4103, $42E6, $5D17, $4208
		fdb $41E4, $5D14, $4106, $41E6,	$5E14, $4002, $41ED, $5F11

; =============== S U B	R O U T	I N E =======================================

; Check	coin inputs

sub_D776:
		lda	IO_Port_0
		anda	#$F
		cmpa	#$F
		beq	loc_D783	; Check	for coin or slam inputs
		lda	#$FF
		sta	<DPbyte_18

loc_D783:
		lda	<DPbyte_18
		bne	loc_D788
		rts
; ---------------------------------------------------------------------------

loc_D788:
		dec	<DPbyte_18
		lda	#$12
		cmpa	<DPbyte_14	; Credits
		bcc	loc_D792
		sta	<DPbyte_14	; Credits

loc_D792:
		lda	<DPbyte_17
		sta	CoinCtr1
		ldb	<DPbyte_16
		stb	CoinCtr2
		ora	<DPbyte_16
		ora	<DPbyte_15
		beq	loc_D7A6
		lda	#$FF
		sta	<DPbyte_18

loc_D7A6:
		lda	IO_Port_0
		anda	#$10
		bne	loc_D7B0
		jmp	loc_D8AE
; ---------------------------------------------------------------------------

loc_D7B0:
		lda	byte_4590
		asla
		asla
		asla
		asla
		sta	<DPbyte_9
		lda	byte_4591
		anda	#$F
		ora	<DPbyte_9
		sta	<DPbyte_9
		lda	<DPbyte_A
		anda	#3
		bne	loc_D7CB
		jsr	sub_C09D

loc_D7CB:
		ldx	#byte_480E

loc_D7CE:
		lda	IO_Port_0
		cmpx	#byte_480D
		beq	loc_D7D9
		bcc	loc_D7DA
		lsra

loc_D7D9:
		lsra

loc_D7DA:
		lsra
		lda	,x
		anda	#$1F
		bcs	loc_D812
		beq	loc_D7EF
		cmpa	#$1B
		bcc	loc_D7ED
		ldb	<DPbyte_A
		andb	#1
		bne	loc_D7EF

loc_D7ED:
		suba	#1

loc_D7EF:
		sta	,x
		lda	IO_Port_0
		anda	#8
		bne	loc_D7FC
		lda	#$F0 ; ''
		sta	<DPbyte_B

loc_D7FC:
		lda	<DPbyte_B
		beq	loc_D808
		dec	<DPbyte_B
		lda	#0
		sta	,x
		sta	3,x

loc_D808:
		lda	3,x
		beq	loc_D860
		dec	3,x
		beq	loc_D82F
		bra	loc_D860
; ---------------------------------------------------------------------------

loc_D812:
		cmpa	#$1B
		bcc	loc_D81E
		lda	,x
		adda	#$20 ; ' '
		bcc	loc_D7EF
		bne	loc_D822

loc_D81E:
		lda	#$1F
		bra	loc_D7EF
; ---------------------------------------------------------------------------

loc_D822:
		lda	#$1F
		sta	,x
		ldb	3,x
		lda	#$78 ; 'x'
		sta	3,x
		tstb
		beq	loc_D860

loc_D82F:
		clra
		cmpx	#byte_480D
		bcs	loc_D853
		beq	loc_D84B
		lda	<DPbyte_9
		anda	#$C
		lsra
		lsra
		beq	loc_D853
		adda	#2
		bra	loc_D853
; ---------------------------------------------------------------------------
byte_D843:	fcb $FF, 4, 8, 8, $A, $FF, $FF,	$FF
; ---------------------------------------------------------------------------

loc_D84B:
		lda	<DPbyte_9
		anda	#$10
		beq	loc_D853
		lda	#1

loc_D853:
		inca
		tfr	a, b
		addb	<DPbyte_13
		stb	<DPbyte_13
		adda	<DPbyte_12
		sta	<DPbyte_12
		inc	9,x

loc_D860:
		leax	-1,x
		cmpx	#byte_480C
		lbge	loc_D7CE
		lda	<DPbyte_9
		lsra
		lsra
		lsra
		lsra
		lsra
		ldb	<DPbyte_13
		aslb
		ldx	#byte_D843
		subb	a,x
		bcs	loc_D88B
		asl	<DPbyte_13
		rorb
		cmpa	#3
		beq	loc_D885
		addb	#$80 ; 'Ä'
		bcc	loc_D889

loc_D885:
		inc	<DPbyte_12
		inc	<DPbyte_12

loc_D889:
		stb	<DPbyte_13

loc_D88B:
		lda	<DPbyte_9
		anda	#3
		beq	loc_D8AC
		tfr	a, b
		nega
		asra
		adda	<DPbyte_12
		bpl	loc_D8A4
		tst	<DPbyte_13
		bpl	loc_D8AE
		inca
		bmi	loc_D8AE
		asl	<DPbyte_13
		lsr	<DPbyte_13

loc_D8A4:
		cmpb	#1
		bne	loc_D8AA
		inc	<DPbyte_14	; Credits

loc_D8AA:				; Credits
		inc	<DPbyte_14

loc_D8AC:
		sta	<DPbyte_12

loc_D8AE:
		ldb	<DPbyte_A
		andb	#$F
		bne	locret_D8DE
		ldx	#byte_4817

loc_D8B7:
		lda	,x
		bpl	loc_D8C0
		anda	#$7F ; ''
		incb
		sta	,x

loc_D8C0:
		leax	-1,x
		cmpx	#byte_4815
		bge	loc_D8B7
		tstb
		bne	locret_D8DE
		ldx	#byte_4817

loc_D8CD:
		lda	,x
		beq	loc_D8D7
		adda	#$7F ; ''
		sta	,x
		bra	locret_D8DE
; ---------------------------------------------------------------------------

loc_D8D7:
		leax	-1,x
		cmpx	#byte_4815
		bge	loc_D8CD

locret_D8DE:
		rts
; End of function sub_D776


; =============== S U B	R O U T	I N E =======================================

; Called from select screen, attract screen 1 +	3 when writing text

sub_D8DF:
		ldx	#byte_4A52
		cmpx	word_4AD9
		bcc	loc_D8F1

loc_D8E7:
		cmpa	,x+
		bne	loc_D8EC
		rts
; ---------------------------------------------------------------------------

loc_D8EC:
		cmpx	word_4AD9
		bcs	loc_D8E7

loc_D8F1:
		sta	,x+
		stx	word_4AD9
		rts
; End of function sub_D8DF


; =============== S U B	R O U T	I N E =======================================

; Doesn't seem to be used anywhere

sub_D8F7:
		ldx	#byte_4A52

loc_D8FA:
		cmpa	,x
		bne	loc_D912
		ldu	word_4AD9
		cmpu	#byte_4A52
		bls	loc_D912
		leau	-1,u
		lda	,u
		sta	,x
		stu	word_4AD9
		leax	,u

loc_D912:
		leax	1,x
		cmpx	word_4AD9
		bcs	loc_D8FA
		rts
; End of function sub_D8F7


; =============== S U B	R O U T	I N E =======================================


sub_D91A:
		ldx	#byte_4A52
		clr	,x
		stx	word_4AD9
		rts
; End of function sub_D91A


; =============== S U B	R O U T	I N E =======================================

; Called from attract screen 1

sub_D923:
		ldu	#byte_4A52
		cmpu	word_4AD9
		bcc	locret_D941

loc_D92C:
		ldb	,u+
		cmpb	#$D6 ; '÷'
		bcc	loc_D93B
		stb	>byte_48AE	; Text string index
		jsr	sub_E7DD	; Insert text colour vector instruction
		jsr	loc_E7FC

loc_D93B:
		cmpu	word_4AD9
		bcs	loc_D92C

locret_D941:
		rts
; End of function sub_D923


; =============== S U B	R O U T	I N E =======================================

; Called from Attract screen 3 + 4

sub_D942:
		ldu	#byte_4A52
		cmpu	word_4AD9
		bcc	locret_D95D

loc_D94B:
		ldb	,u+
		cmpb	#$D6 ; '÷'
		bcc	loc_D957
		stb	>byte_48AE	; Text string index
		jsr	loc_E7FC

loc_D957:
		cmpu	word_4AD9
		bcs	loc_D94B

locret_D95D:
		rts
; End of function sub_D942


; =============== S U B	R O U T	I N E =======================================

; Attract screen 2 text	position control

sub_D95E:
		ldu	word_4ADD
		sta	,u+
		ldd	#0
		std	,u++
		ldd	#$100
		std	,u++
		stu	word_4ADD
		rts
; End of function sub_D95E


; =============== S U B	R O U T	I N E =======================================


sub_D971:
		ldu	#byte_4A66

loc_D974:
		cmpa	,u
		bne	loc_D97C
		lda	#0
		std	,u

loc_D97C:
		leau	5,u
		cmpu	word_4ADD
		bcs	loc_D974
		rts
; End of function sub_D971


; =============== S U B	R O U T	I N E =======================================


sub_D985:
		ldu	#byte_4A66
		cmpu	word_4ADD
		bcc	locret_D9DB
		ldd	#$7200
		std	,y++

loc_D993:
		lda	,u+
		beq	loc_D9D3
		sta	>byte_48AE	; Text string index
		ldd	#$198
		std	,y++
		ldd	#0
		std	,y++
		ldb	,u
		lda	#$71 ; 'q'
		std	,y++
		comb
		addb	#$10
		lda	#$62 ; 'b'
		std	,y++
		ldx	#off_E99E
		ldb	>byte_48AE	; Text string index
		abx
		abx
		ldd	#$1DD0
		std	,y++
		ldd	,x
		anda	#$1F
		ora	#0
		std	,y++
		jsr	sub_E821	; Text handling
		ldd	#$7200
		std	,y++
		ldd	#$8040
		std	,y++

loc_D9D3:
		leau	4,u
		cmpu	word_4ADD
		bcs	loc_D993

locret_D9DB:
		rts
; End of function sub_D985


; =============== S U B	R O U T	I N E =======================================

; Initialise before game start

sub_D9DC:
		ldd	#0
		std	word_4AE4
		ldd	#$6018
		std	word_4AE6
		ldd	#byte_4A66
		std	word_4ADD
		ldd	word_DB2F
		std	word_4AE2
		lda	#$51 ; 'Q'
		sta	word_4ADF
		rts
; End of function sub_D9DC


; =============== S U B	R O U T	I N E =======================================


sub_D9FA:
		ldd	word_4AE4
		addd	#1
		std	word_4AE4
		cmpd	#$F8 ; '¯'
		lbcc	loc_DA94
		cmpd	#$40 ; '@'
		bcc	loc_DA1E
		ldd	word_4AE6
		addb	#3
		std	word_4AE6
		ldd	#$40 ; '@'
		bra	loc_DA2A
; ---------------------------------------------------------------------------

loc_DA1E:
		ldd	word_4AE4
		comb
		addb	#$18
		std	word_4AE6
		ldd	word_4AE4

loc_DA2A:
		ora	#$73 ; 's'
		std	word_4AE8
		ldd	word_4AE6
		ora	#$61 ; 'a'
		std	,y++
		ldd	#$198
		std	,y
		std	8,y
		std	$10,y
		std	$18,y
		std	$20,y
		std	$28,y
		ldd	#0
		std	2,y
		std	$A,y
		std	$12,y
		std	$1A,y
		std	$22,y
		std	$2A,y
		ldd	word_4AE8
		std	4,y
		std	$C,y
		std	$14,y
		std	$1C,y
		std	$24,y
		std	$2C,y
		ldd	#$B400
		std	6,y
		ldd	#$B434
		std	$E,y
		ldd	#$B458
		std	$16,y
		ldd	#$B488
		std	$1E,y
		ldd	#$B4AE
		std	$26,y
		ldd	#$B4D2
		std	$2E,y
		leay	$30,y

loc_DA94:
		ldx	#byte_4A66
		cmpx	word_4ADD
		bcc	loc_DAF5

loc_DA9C:
		ldd	word_4AE4
		cmpd	#$E0 ; '‡'
		bcc	loc_DAB3
		cmpd	#$40 ; '@'
		bcs	loc_DAB1
		ldd	1,x
		addd	3,x
		std	1,x

loc_DAB1:
		bra	loc_DAEE
; ---------------------------------------------------------------------------

loc_DAB3:
		cmpd	#$160
		bcc	loc_DAC1
		ldd	#$400
		std	word_4A69
		bra	loc_DAEE
; ---------------------------------------------------------------------------

loc_DAC1:
		ldd	1,x
		addd	3,x
		std	1,x
		cmpd	#$F000
		bcs	loc_DAEE
		lda	,x
		inca
		ldu	#byte_4A66

loc_DAD3:
		cmpa	,u
		bne	loc_DADF
		ldd	#$400
		std	3,u
		ldu	word_4ADD

loc_DADF:
		leau	5,u
		cmpu	word_4ADD
		bcs	loc_DAD3
		lda	,x
		jsr	sub_D971
		leax	-5,x

loc_DAEE:
		leax	5,x
		cmpx	word_4ADD
		bcs	loc_DA9C

loc_DAF5:
		ldd	word_4AE4
		cmpd	#$200
		bcs	loc_DB03
		lda	#7
		sta	word_4841

loc_DB03:
		cmpd	word_4AE2
		bcs	locret_DB2E
		lda	word_4ADF
		jsr	sub_D95E	; Attract screen 2 text	position control
		lda	word_4ADF
		inca
		cmpa	#$59 ; 'Y'
		bcs	loc_DB1F
		ldd	#$FFFF
		std	word_4AE2
		bra	locret_DB2E
; ---------------------------------------------------------------------------

loc_DB1F:
		sta	word_4ADF
		ldx	#aStarWar-$B2
		tfr	a, b
		abx
		abx
		ldd	,x
		std	word_4AE2

locret_DB2E:
		rts
; End of function sub_D9FA

; ---------------------------------------------------------------------------
word_DB2F:	fdb $41
		fcb   0
		fcb $50	; P
		fcb   0
		fcb $60	; `
		fcb   0
		fcb $70	; p
		fcb   0
		fcb $80	; Ä
		fcb   0
		fcb $90	; ê
		fcb   0
		fcb $A0	; †
		fcb   0
		fcb $B8	; ∏
aStarWar:	fcc "STAR WAR”"
a1983LucasfilmLtd:fcc "@ 1983 LUCASFILM LTD. AND ATARI,INCÆ"
aAllRightsReserved:fcc "ALL RIGHTS RESERVEDÆ"
aLucasfilmTrademar:fcc "LUCASFILM TRADEMARKS USED UNDER LICENSEÆ"
aGameOve:	fcc "GAME OVE“"
aInsertCoin:	fcc "INSERT COIN”"
aFreePla_0:	fcc "FREE PLAŸ"
a2Plays1Coi:	fcc "2 PLAYS 1 COIŒ"
a1Coin1Pla:	fcc "1 COIN 1 PLAŸ"
a2Coins1Pla:	fcc "2 COINS 1 PLAŸ"
aPullTriggerToStar:fcc "PULL TRIGGER TO STAR‘"
aCredit:	fcc "CREDIT”"
aCredi_0:	fcc "CREDI‘"
aShieldGon:	fcc "SHIELD GON≈"
aFlightInstruction:fcc "FLIGHT INSTRUCTIONS TO RED FIV≈"
a1_YourXWingIsEqui:fcc "1.  YOUR X-WING IS EQUIPPED WITH AŒ"
aInvisibleDeflecto:fcc "INVISIBLE DEFLECTOR SHIELD THA‘"
aWillProtectYouFor:fcc "WILL PROTECT YOU FOR   COLLISIONSÆ"
a2_DeflectorStreng:fcc "2.  DEFLECTOR STRENGTH IS LOST WHEŒ"
aAFireballImpactsY:fcc "A FIREBALL IMPACTS YOUR SHIELD O“"
aWhenYouStrikeALas:fcc "WHEN YOU STRIKE A LASER TOWER O“"
aTrenchCatwalko:fcc "TRENCH CATWALKÆ"
a3_AimYourLasersWi:fcc "3.  AIM YOUR LASERS WITH CURSOR Tœ"
aExplodeEmpireTieF:fcc "EXPLODE EMPIRE TIE FIGHTERS, LASE“"
aTowerTopsAndTrenc:fcc "TOWER TOPS AND TRENCH TURRETSÆ"
a4_ShootFireballsB:fcc "4.  SHOOT FIREBALLS BEFORE THEŸ"
aImpactYourShieldo:fcc "IMPACT YOUR SHIELDÆ"
a5_TheRebelForceIs:fcc "5.  THE REBEL FORCE IS DEPENDING OŒ"
aYouToStopTheEmpir:fcc "YOU TO STOP THE EMPIRE BY BLOWIN«"
aUpTheDeathStaro:fcc "UP THE DEATH STARÆ"
unk_DDFC:	fcb $B6	; ∂
unk_DDFD:	fcb $B7	; ∑
unk_DDFE:	fcb $B8	; ∏
unk_DDFF:	fcb $B9	; π
aScorin:	fcc "SCORIN«"
aTieFighters100:fcc "TIE FIGHTERS                 1,00∞"
aDarthVaderSShip20:fcc "DARTH VADER"
		fcb $27
		fcc "S SHIP           2,00∞"
aLaserBunkers20:fcc "LASER BUNKERS                  20∞"
aLaserTowers20:	fcc "LASER TOWERS                   20∞"
aTrenchTurrets10:fcc "TRENCH TURRETS                 10∞"
aFireballs3:	fcc "FIREBALLS                       3≥"
aExhaustPort2500:fcc "EXHAUST PORT                25,00∞"
aDestroyingAllTowe:fcc "DESTROYING ALL TOWER TOPS   50,00∞"
aSelectADeathSta:fcc "SELECT A DEATH STA“"
aFireLaserAtDesire:fcc "FIRE LASER AT DESIRED DEATH STA“"
aCountdow:	fcc "COUNTDOWŒ"
aEas_0:		fcc "EASŸ"
aMediu:		fcc "MEDIUÕ"
aHar_0:		fcc "HARƒ"
aWave_1:	fcc "WAVE ±"
aWave_0:	fcc "WAVE ≥"
aWave:		fcc "WAVE µ"
aBonu:		fcc "BONU”"
aNoBonu:	fcc "NO BONU”"
a40000:		fcc "400,00∞"
a80000:		fcc "800,00∞"
aMessageFromRebelC:fcc "MESSAGE FROM REBEL COMMAND POS‘"
aYouAreATrueRebelP:fcc "YOU ARE A TRUE REBEL PILO‘"
aTheForceIsWithYo:fcc "THE FORCE IS WITH YO’"
aShootYourInitial:fcc "SHOOT YOUR INITIAL”"
aPrincessLeiaSRebe:fcc "PRINCESS LEIA"
		fcb $27
		fcc "S REBEL FORC≈"
aPointsNextTowe:fcc "POINTS NEXT TOWE“"
aTower:		fcc "TOWER”"
aClearedAllLaserTo:fcc "CLEARED ALL LASER TOWER”"
a50000ForShootingA:fcc "50,000 FOR SHOOTING ALL TOWER”"
aExhaustPortAhea:fcc "EXHAUST PORT AHEAƒ"
aDeathStarDestroye:fcc "DEATH STAR DESTROYEƒ"
aExhaustPortMisse:fcc "EXHAUST PORT MISSEƒ"
aBonusForRemaining:fcc "BONUS FOR REMAINING ENERGŸ"
a5000:		fcc "5,000  ÿ"
aAddedToDeflectorS:fcc "ADDED TO DEFLECTOR SHIELƒ"
aShieldAtFullStren:fcc "SHIELD AT FULL STRENGT»"
aStartingWaveBonu:fcc "STARTING WAVE BONU”"
aShootFireball:	fcc "SHOOT FIREBALL”"
aShootTieFighter:fcc "SHOOT TIE FIGHTER”"
aAvoidCatwalk:	fcc "AVOID CATWALK”"
aUseTheForc:	fcc "USE THE FORC≈"
aForUsingTheForc:fcc " FOR USING THE FORC≈"
aObiWanKenobiIsGon:fcc "OBI-WAN KENOBI IS GONE BUT HI”"
aPresenceIsFeltWit:fcc "PRESENCE IS FELT WITHIN THE FORCEÆ"
aTheEmpireSDeathSt:fcc "THE EMPIRE"
		fcb $27
		fcc "S DEATH STAR, UNDER TH≈"
aCommandOfDarthVad:fcc "COMMAND OF DARTH VADER, NEARS TH≈"
aRebelPlanet_YouMu:fcc "REBEL PLANET.  YOU MUST JOIN TH≈"
aRebellionToStopTh:fcc "REBELLION TO STOP THE EMPIREÆ"
aTheForceWillBeWit:fcc "THE FORCE WILL BE WITH YOUÆ"
aAlway:		fcc "ALWAY”"
aAccountingInforma:fcc "ACCOUNTING INFORMATIOŒ"
aAuxCoin:	fcc "AUX COIN”"
aLeftMechCoin:	fcc "LEFT MECH COIN”"
aRightMechCoin:	fcc "RIGHT MECH COIN”"
aTotalCoinsPai:	fcc "TOTAL COINS PAIƒ"
aGamesPlaye:	fcc "GAMES PLAYEƒ"
aHighWav:	fcc "HIGH WAV≈"
aTotalGameTimeSeco:fcc "TOTAL GAME TIME           SECOND”"
aAverageGameTim:fcc "AVERAGE GAME TIM≈"
aTotalTimeOnSecond:fcc "TOTAL TIME ON           SECOND”"
aPercentageOfPlayP:fcc "PERCENTAGE OF PLAY     PERCEN‘"
aHistoryOfGameTime:fcc "HISTORY OF GAME TIME”"
aGameOption:	fcc "GAME OPTION”"
aValueOfACoi:	fcc "VALUE OF A COIŒ"
aLeftMechValu:	fcc "LEFT MECH VALU≈"
aRightMechValu:	fcc "RIGHT MECH VALU≈"
aBonusAdde:	fcc "BONUS ADDE“"
aStartingShiel:	fcc "STARTING SHIELƒ"
aPlayDifficult:	fcc "PLAY DIFFICULTŸ"
aBonusShiel:	fcc "BONUS SHIELƒ"
aMusicInAttrac:	fcc "MUSIC IN ATTRAC‘"
aResetHighScore:fcc "RESET HIGH SCORE”"
aResetTimingInf:fcc "RESET TIMING INFœ"
aResetOption:	fcc "RESET OPTION”"
aTestNovra:	fcc "TEST NOVRAÕ"
aUpDownToSelectIte:fcc "UP,DOWN TO SELECT ITEÕ"
aPullLeftFireToCha:fcc "PULL LEFT FIRE TO CHANGE SETTIN«"
aFreePla:	fcc "FREE PLAŸ"
a2Credit:	fcc "2 CREDIT”"
a1Credi:	fcc "1 CREDI‘"
aCredi:		fcc "% CREDI‘"
unk_E41E:	fcb $B1	; ±
unk_E41F:	fcb $B2	; ≤
unk_E420:	fcb $B1	; ±
unk_E421:	fcb $B4	; ¥
unk_E422:	fcb $B5	; µ
unk_E423:	fcb $B6	; ∂
aNon_0:		fcc "NON≈"
a2Gives:	fcc "2 GIVES ±"
a4Gives_0:	fcc "4 GIVES ±"
a4Gives:	fcc "4 GIVES ≤"
a5Gives:	fcc "5 GIVES ±"
a3Gives:	fcc "3 GIVES ±"
aNon:		fcc "NON≈"
unk_E459:	fcb $B6	; ∂
unk_E45A:	fcb $B7	; ∑
unk_E45B:	fcb $B8	; ∏
unk_E45C:	fcb $B9	; π
aEas:		fcc "EASŸ"
aModerat:	fcc "MODERAT≈"
aHar:		fcc "HARƒ"
aHardes:	fcc "HARDES‘"
unk_E474:	fcb $B0	; ∞
unk_E475:	fcb $B1	; ±
unk_E476:	fcb $B2	; ≤
unk_E477:	fcb $B3	; ≥
aYe_3:		fcc "YE”"
aN_3:		fcc "Nœ"
aN_2:		fcc "Nœ"
aYe_2:		fcc "YE”"
aN_1:		fcc "Nœ"
aYe_1:		fcc "YE”"
aN_0:		fcc "Nœ"
aYe_0:		fcc "YE”"
aN:		fcc "Nœ"
aYe:		fcc "YE”"
aNoError:	fcc "NO ERROR”"
aErrorA:	fcc "ERROR A‘"
aSwitchTes:	fcc "SWITCH TES‘"
aLeftFir:	fcc "LEFT FIR≈"
aRightFir:	fcc "RIGHT FIR≈"
aSpare_0:	fcc "SPARE ±"
aSelfTes:	fcc "SELF TES‘"
aSla:		fcc "SLAÕ"
aAuxCoi:	fcc "AUX COIŒ"
aLeftCoi:	fcc "LEFT COIŒ"
aRightCoiA:	fcc "RIGHT COIŒ†"
aLeftThum:	fcc "LEFT THUM¬"
aRightThum:	fcc "RIGHT THUM¬"
aSpare:		fcc "SPARE ≤"
unk_E50C:	fcb $A0	; †
aPotTes:	fcc "POT TES‘"
aHardwareError:	fcc "HARDWARE ERROR”"
aNoErrorsDetecte:fcc "NO ERRORS DETECTEƒ"
aProgramRamAt2f:fcc "PROGRAM RAM AT 2F»"
aMathRamAt5_0:	fcc "MATH RAM AT 5∆"
aMathRamAt5:	fcc "MATH RAM AT 5»"
aVgRam0At3:	fcc "VG RAM0 AT 3Ã"
aVgRam1At3:	fcc "VG RAM1 AT 3Õ"
aVgRam2At3:	fcc "VG RAM2 AT 3–"
aVgRam3At4:	fcc "VG RAM3 AT 4Ã"
aVgRam4At4:	fcc "VG RAM4 AT 4Õ"
aVgRam5At4:	fcc "VG RAM5 AT 4–"
aNonVolatileRamAt1:fcc "NON VOLATILE RAM AT 1≈"
aProgramRom0At1:fcc "PROGRAM ROM0 AT 1∆"
aProgramRom1At1h:fcc "PROGRAM ROM1 AT 1H "
aProgramRom2At1j:fcc "PROGRAM ROM2 AT 1JÀ"
aProgramRom3At1k:fcc "PROGRAM ROM3 AT 1KÃ"
aProgramRom4At1:fcc "PROGRAM ROM4 AT 1Õ"
aVgRomAt1:	fcc "VG ROM AT 1Ã"
aMathboxTest:	fcc "MATHBOX TEST”"
aBadMathboxReadyLi:fcc "BAD MATHBOX READY LIN≈"
aDividerError:	fcc "DIVIDER ERROR”"
aNoDividerError:fcc "NO DIVIDER ERROR”"
aOptSwNumDivDenIsE:fcc "OPT SW    NUM DIV DEN IS ERRO“"
aMatrixError:	fcc "MATRIX ERROR”"
aNoMatrixError:	fcc "NO MATRIX ERROR”"
aBipTes:	fcc "BIP TES‘"
aAlignTheBoxe:	fcc "ALIGN THE BOXE”"
aScaleTes:	fcc "SCALE TES‘"
aLinea:		fcc "LINEA“"
aLinearAndBinar:fcc "LINEAR AND BINARŸ"
unk_E6E6:	fcb $30	; 0
		fcb $2E	; .
		fcb $20
aOf:		fcc "OF∆"
a1_Di:		fcc "1. DIÕ"
a2_Lo:		fcc "2. LO◊"
a3_Hig:		fcc "3. HIG»"
aIntensityTes:	fcc "INTENSITY TES‘"
aPressAuxCoinToCon:fcc "PRESS AUX COIN TO CONTINU≈"
aPressAuxCoinForSe:fcc "PRESS AUX COIN FOR SELF TES‘"
aPullRightFireToPe:fcc "PULL RIGHT FIRE TO PERFORM RESET”"

; =============== S U B	R O U T	I N E =======================================


sub_E764:
		lda	,x
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	<DPbyte_AD
		bgt	sub_E772	; Display BCD number text
		ldd	#$B913
		std	,y++
; End of function sub_E764


; =============== S U B	R O U T	I N E =======================================

; Display BCD number text

sub_E772:
		lda	1,x
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	2,x
		lsra
		lsra
		lsra
		lsra
		jsr	loc_E7AD
		lda	<DPbyte_AD
		bgt	loc_E789
		ldd	#$B913
		std	,y++

loc_E789:
		lda	2,x
		jsr	loc_E7AD
		lda	3,x
; End of function sub_E772


; =============== S U B	R O U T	I N E =======================================

; Display BCD numbers

Display_Vect_BCD:
		tfr	a, b
		lsrb
		lsrb
		lsrb
		andb	#$1E
		bne	loc_E7A2
		tst	<DPbyte_AD
		ble	loc_E7A2
		ldu	$3002
		bra	loc_E7A9
; ---------------------------------------------------------------------------

loc_E7A2:
		clr	<DPbyte_AD
		ldu	#$3004
		ldu	b,u

loc_E7A9:
		dec	<DPbyte_AD
		stu	,y++

loc_E7AD:
		asla
		anda	#$1E
		bne	loc_E7BB
		tst	<DPbyte_AD
		ble	loc_E7BB
		ldu	$3002
		bra	loc_E7C2
; ---------------------------------------------------------------------------

loc_E7BB:
		clr	<DPbyte_AD
		ldu	#(word_3002+2)
		ldu	a,u

loc_E7C2:
		dec	<DPbyte_AD
		stu	,y++
		rts
; End of function Display_Vect_BCD


; =============== S U B	R O U T	I N E =======================================

; Print	text string from pointer table

sub_E7C7:
		cmpb	#$D6 ; '÷'
		bcc	locret_E7D2
		stb	>byte_48AE	; Text string index
		bsr	sub_E7DD	; Insert text colour vector instruction
		bsr	sub_E7EA	; Insert text position vector instruction

locret_E7D2:
		rts
; End of function sub_E7C7


; =============== S U B	R O U T	I N E =======================================


sub_E7D3:
		cmpb	#$D6 ; '÷'
		bcc	locret_E7DC
		stb	>byte_48AE	; Text string index
		bsr	sub_E7EA	; Insert text position vector instruction

locret_E7DC:
		rts
; End of function sub_E7D3


; =============== S U B	R O U T	I N E =======================================

; Insert text colour vector instruction

sub_E7DD:
		ldb	>byte_48AE	; Text string index
		ldx	#word_EDA8	; Text string colour
		abx
		abx
		ldd	,x
		std	,y++
		rts
; End of function sub_E7DD


; =============== S U B	R O U T	I N E =======================================

; Insert text position vector instruction

sub_E7EA:
		ldb	>byte_48AE	; Text string index
		ldx	#word_EA50	; Text string position
		abx
		abx
		abx
		abx
		ldd	2,x
		std	,y++
		ldd	,x
		bra	loc_E811
; ---------------------------------------------------------------------------

loc_E7FC:				; Text string index
		ldb	>byte_48AE
		ldx	#word_EA50	; Text string position
		abx
		abx
		abx
		abx
		ldd	2,x
		subd	>byte_48AF
		anda	#$1F
		std	,y++
		ldd	,x

loc_E811:
		std	,y++
		jsr	sub_E821	; Text handling
		ldd	#$7200		; Vector SCAL 2,0 instruction
		std	,y++
		ldd	#$8040		; Vector CNTR instruction
		std	,y++
		rts
; End of function sub_E7EA


; =============== S U B	R O U T	I N E =======================================

; Text handling

sub_E821:
		ldx	#ptrText
		ldb	>byte_48AE	; Text string index
		abx
		abx
		ldx	,x

loc_E82B:
		ldb	,x+
		stx	>word_48B1
		aslb
		cmpb	#$82 ; 'Ç'
		bcs	loc_E83C
		ldx	#$3016
		andb	#$7F ; ''
		bra	loc_E888
; ---------------------------------------------------------------------------

loc_E83C:
		cmpb	#$74 ; 't'
		bne	loc_E845
		ldx	#$2FDE
		bra	loc_E888
; ---------------------------------------------------------------------------

loc_E845:
		cmpb	#$80 ; 'Ä'
		bne	loc_E84F
		ldx	#$3058
		clrb
		bra	loc_E888
; ---------------------------------------------------------------------------

loc_E84F:
		cmpb	#$60 ; '`'
		bcs	loc_E858
		ldx	#$2FA4
		bra	loc_E888
; ---------------------------------------------------------------------------

loc_E858:
		cmpb	#$40 ; '@'
		bne	loc_E861
		ldx	#$2FC2
		bra	loc_E888
; ---------------------------------------------------------------------------

loc_E861:
		cmpb	#$4E ; 'N'
		bne	loc_E86A
		ldx	#$2FFE
		bra	loc_E888
; ---------------------------------------------------------------------------

loc_E86A:
		cmpb	#$58 ; 'X'
		bne	loc_E873
		ldx	#$2FF6
		bra	loc_E888
; ---------------------------------------------------------------------------

loc_E873:
		cmpb	#$5A ; 'Z'
		bne	loc_E87C
		ldx	#word_3000
		bra	loc_E888
; ---------------------------------------------------------------------------

loc_E87C:
		cmpb	#$4A ; 'J'
		bne	loc_E885
		ldx	#(word_3002+$A)
		bra	loc_E888
; ---------------------------------------------------------------------------

loc_E885:
		ldx	#$2FF4

loc_E888:
		ldd	b,x
		std	,y++
		ldx	>word_48B1
		tst	-1,x
		bpl	loc_E82B
		rts
; End of function sub_E821

; ---------------------------------------------------------------------------
ptrText:	fdb aStarWar
		fdb a1983LucasfilmLtd
		fdb aAllRightsReserved
		fdb aLucasfilmTrademar
		fdb aGameOve
		fdb aGameOve
		fdb aInsertCoin
		fdb aFreePla_0
		fdb a2Plays1Coi
		fdb a1Coin1Pla
		fdb a2Coins1Pla
		fdb aPullTriggerToStar
		fdb aCredit
		fdb aCredi_0
		fdb aShieldGon
		fdb aFlightInstruction
		fdb a1_YourXWingIsEqui
		fdb aInvisibleDeflecto
		fdb aWillProtectYouFor
		fdb a2_DeflectorStreng
		fdb aAFireballImpactsY
		fdb aWhenYouStrikeALas
		fdb aTrenchCatwalko
		fdb a3_AimYourLasersWi
		fdb aExplodeEmpireTieF
		fdb aTowerTopsAndTrenc
		fdb a4_ShootFireballsB
		fdb aImpactYourShieldo
		fdb a5_TheRebelForceIs
		fdb aYouToStopTheEmpir
		fdb aUpTheDeathStaro
		fdb unk_DDFC
		fdb unk_DDFD
		fdb unk_DDFE
		fdb unk_DDFF
		fdb aScorin
		fdb aTieFighters100
		fdb aDarthVaderSShip20
		fdb aLaserBunkers20
		fdb aLaserTowers20
		fdb aTrenchTurrets10
		fdb aFireballs3
		fdb aExhaustPort2500
		fdb aDestroyingAllTowe
		fdb aSelectADeathSta
		fdb aFireLaserAtDesire
		fdb aCountdow
		fdb aEas_0
		fdb aMediu
		fdb aHar_0
		fdb aWave_1
		fdb aWave_0
		fdb aWave
		fdb aBonu
		fdb aBonu
		fdb aNoBonu
		fdb a40000
		fdb a80000
		fdb aMessageFromRebelC
		fdb aYouAreATrueRebelP
		fdb aTheForceIsWithYo
		fdb aShootYourInitial
		fdb aPrincessLeiaSRebe
		fdb aPrincessLeiaSRebe
		fdb aPointsNextTowe
		fdb aTower
		fdb aClearedAllLaserTo
		fdb a50000ForShootingA
		fdb aExhaustPortAhea
		fdb aDeathStarDestroye
		fdb aExhaustPortMisse
		fdb aBonusForRemaining
		fdb a5000
		fdb aAddedToDeflectorS
		fdb aShieldAtFullStren
		fdb aStartingWaveBonu
		fdb aShootFireball
		fdb aShootTieFighter
		fdb aAvoidCatwalk
		fdb aUseTheForc
		fdb aForUsingTheForc
		fdb aObiWanKenobiIsGon
		fdb aPresenceIsFeltWit
		fdb aTheEmpireSDeathSt
		fdb aCommandOfDarthVad
		fdb aRebelPlanet_YouMu
		fdb aRebellionToStopTh
		fdb aTheForceWillBeWit
		fdb aAlway
		fdb aAccountingInforma
		fdb aAuxCoin
		fdb aLeftMechCoin
		fdb aRightMechCoin
		fdb aTotalCoinsPai
		fdb aGamesPlaye
		fdb aHighWav
		fdb aTotalGameTimeSeco
		fdb aAverageGameTim
		fdb aTotalTimeOnSecond
		fdb aPercentageOfPlayP
		fdb aHistoryOfGameTime
		fdb aGameOption
		fdb aValueOfACoi
		fdb aLeftMechValu
		fdb aRightMechValu
		fdb aBonusAdde
		fdb aStartingShiel
		fdb aPlayDifficult
		fdb aBonusShiel
		fdb aMusicInAttrac
		fdb aResetHighScore
		fdb aResetTimingInf
		fdb aResetOption
		fdb aTestNovra
		fdb aUpDownToSelectIte
		fdb aPullLeftFireToCha
		fdb aFreePla
		fdb a2Credit
		fdb a1Credi
		fdb aCredi
		fdb unk_E41E
		fdb unk_E41F
		fdb unk_E420
		fdb unk_E421
		fdb unk_E422
		fdb unk_E423
		fdb aNon_0
		fdb a2Gives
		fdb a4Gives_0
		fdb a4Gives
		fdb a5Gives
		fdb a3Gives
		fdb aNon
off_E99E:	fdb aNon
		fdb unk_E459
		fdb unk_E45A
		fdb unk_E45B
		fdb unk_E45C
		fdb aEas
		fdb aModerat
		fdb aHar
		fdb aHardes
		fdb unk_E474
		fdb unk_E475
		fdb unk_E476
		fdb unk_E477
		fdb aYe_3
		fdb aN_3
		fdb aN_2
		fdb aYe_2
		fdb aN_1
		fdb aYe_1
		fdb aN_0
		fdb aYe_0
		fdb aN
		fdb aYe
		fdb aNoError
		fdb aErrorA
		fdb aSwitchTes
		fdb aLeftFir
		fdb aRightFir
		fdb aSpare_0
		fdb aSelfTes
		fdb aSla
		fdb aAuxCoi
		fdb aLeftCoi
		fdb aRightCoiA
		fdb aRightCoiA+$A
		fdb aRightCoiA+$A
		fdb aLeftThum
		fdb aRightThum
		fdb aSpare
		fdb unk_E50C
		fdb unk_E50C
		fdb unk_E50C
		fdb aPotTes
		fdb aHardwareError
		fdb aNoErrorsDetecte
		fdb aProgramRamAt2f
		fdb aMathRamAt5_0
		fdb aMathRamAt5
		fdb aVgRam0At3
		fdb aVgRam1At3
		fdb aVgRam2At3
		fdb aVgRam3At4
		fdb aVgRam4At4
		fdb aVgRam5At4
		fdb aNonVolatileRamAt1
		fdb aProgramRom0At1
		fdb aProgramRom1At1h
		fdb aProgramRom2At1j
		fdb aProgramRom3At1k
		fdb aProgramRom4At1
		fdb aVgRomAt1
		fdb aMathboxTest
		fdb aBadMathboxReadyLi
		fdb aDividerError
		fdb aNoDividerError
		fdb aOptSwNumDivDenIsE
		fdb aMatrixError
		fdb aNoMatrixError
		fdb aBipTes
		fdb aAlignTheBoxe
		fdb aScaleTes
		fdb aLinea
		fdb aLinearAndBinar
		fdb unk_E6E6
		fdb a1_Di
		fdb a2_Lo
		fdb a3_Hig
		fdb aIntensityTes
		fdb aPressAuxCoinToCon
		fdb aPressAuxCoinForSe
		fdb aPullRightFireToPe
		fdb $FE9C, $FE6C, $FE6C, $FE78,	$FE84, $FEA8, $FEC0, $FFBC
word_EA50:	fdb $1F98, $1E5C, $1E6C, $1E38,	$1F20, $1E14, $1E30, $1DF0 ; Text string position
		fdb $1F98, 0, $1F98, $1E0, $1F74, $1E0,	$1F98, $1B0
		fdb $1F5C, $1B0, $1F68,	$1B0, $1F5C, $1B0, $1F08, $1E0
		fdb $1FC4, $1B0, $1FC4,	$1B0, $1F8C, $E6, $1E74, $120
		fdb $1E44, $D8,	$1E5C, $B4, $1E5C, $90,	$1E44, $48
		fdb $1E5C, $24,	$1E5C, 0, $1E5C, $1FDC,	$1E44, $1F94
		fdb $1E5C, $1F70, $1E5C, $1F4C,	$1E44, $1F04, $1E5C, $1EE0
		fdb $1E44, $1E98, $1E5C, $1E74,	$1E5C, $1E50, $54, $90
		fdb $54, $90, $54, $90,	$54, $90, $1FC4, $118
		fdb $1E8C, $B4,	$1E8C, $78, $1E8C, $3C,	$1E8C, 0
		fdb $1E8C, $1FC4, $1E8C, $1F88,	$1E8C, $1EE8, $1E8C, $1EA2
		fdb $1F20, $154, $1E84,	$12C, $1F98, $104, $1ED4, $20
		fdb $1FBC, $1F38, $E0, $20, $1E2C, $C8,	$1FBC, $1F60
		fdb $14C, $C8, $1FC8, $1E70, $158, 0, $1E14, 0
		fdb $1FB0, $1E48, $140,	$1FD8, $1E90, $154, $1ECC, $118
		fdb $1F08, $DC,	$1F20, $78, $1EC0, 0, $1EC0, $13C
		fdb $1F80, $180, $13A, $1BC, $1EE4, $180, $1E9C, $180
		fdb $1F2C, $9C,	$1F14, $138, $1F20, $9C, $1ECC,	$C0
		fdb $1F80, $90,	$1EF0, $48, $1EF0, $48,	$1F20, $1FD0
		fdb $1F50, $180, $1F2C,	$180, $1F5C, $180, $1F68, $150
		fdb 0, 0, 0, 0,	0, 0, 0, 0
		fdb 0, 0, 0, 0,	0, 0, 0, 0
		fdb 0, 0, $1EFC, $1E0, $1F28, $1B8, $1E98, $190
		fdb $1E80, $168, $1E80,	$140, $1EE0, $118, $FA,	$140
		fdb $1E98, $DC,	$1E68, $B4, $1EC8, $78,	$1E50, $50
		fdb $1F08, 0, $1F74, $1F4, $1E98, $1C2,	$1E98, $190
		fdb $1E80, $15E, $1EF8,	$12C, $1E98, $FA, $1E98, $C8
		fdb $1EE0, $96,	$1E80, $64, $1E68, 0, $1E68, $1FCE
		fdb $1EC8, $1F9C, $1EF8, $1F6A,	$1EFC, $1ED4, $1E90, $1EA2
		fdb $48, $1C2, $48, $1C2, $48, $1C2, $48, $1C2
		fdb $48, $190, $48, $190, $48, $15E, $48, $15E
		fdb $48, $15E, $48, $15E, $48, $12C, $48, $12C
		fdb $48, $12C, $48, $12C, $48, $12C, $48, $12C
		fdb $48, $12C, $48, $12C, $48, $FA, $48, $FA
		fdb $48, $FA, $48, $FA,	$48, $C8, $48, $C8
		fdb $48, $C8, $48, $C8,	$48, $96, $48, $96
		fdb $48, $96, $48, $96,	$48, $64, $48, $64
		fdb $48, 0, $48, 0, $48, $1FCE,	$48, $1FCE
		fdb $48, $1F9C,	$48, $1F9C, $48, $1F6A,	$48, $1F6A
		fdb $B2, $1F6A,	$B2, $1F6A, $1F80, $190, $1ED4,	$12C
		fdb $64, $12C, $1FB0, $1F6A, $1F98, $C8, $1FD4,	$96
		fdb $1FA4, $64,	$1F98, $32, $1F8C, 0, $1F68, $1FCE
		fdb $1F98, $1F9C, $1EBC, $FA, $64, $FA,	$1FB0, $1F38
		fdb $1F8C, $1F06, $1FB0, $1ED4,	$1FBC, $1ED4, $E4, $D2
		fdb $1F50, $1C2, $1F2C,	0, $1F38, $190,	$1F5C, $15E
		fdb $1F5C, $12C, $1F74,	$FA, $1F74, $C8, $1F74,	$96
		fdb $1F74, $64,	$1F74, $32, $1F74, 0, $1EFC, $1FCE
		fdb $1F38, $1F38, $1F38, $1F06,	$1F38, $1ED4, $1F38, $1EA2
		fdb $1F38, $1E70, $1F74, $1F6A,	$1F68, $190, $1EFC, $C8
		fdb $1F5C, $15E, $1F38,	$C8, $1E98, $113, $1F68, $1F9C
		fdb $1F44, $1ED4, $1FA4, $64, $1F50, $1F9C, $1F8C, $FA
		fdb $1FBC, $BE,	$1F38, $BE, $1F9C, $1F38, $1F9C, $1F06
		fdb $1F9C, $1ED4, $1F9C, $1EA2,	$1F5C, $12C, $1ECC, $1E3E
		fdb $1EB4, $1E3E, $1E78, $1F06
word_EDA8:	fdb $6280, $6280, $6280, $6280,	$64FF, $6380, $6180, $6680 ; Text string colour
		fdb $6680, $6680, $6680, $A01A,	$6780, $6780, $A01A, $6480
		fdb $6480, $6480, $6480, $6480,	$6480, $6480, $6480, $6480
		fdb $6480, $6480, $6480, $6480,	$6480, $6480, $6480, $6480
		fdb $6480, $6480, $6480, $6580,	$6580, $6580, $6580, $6580
		fdb $6580, $6580, $6580, $6580,	$6580, $6580, $A01A, $6280
		fdb $6280, $6280, $6480, $6480,	$6480, $6180, $6180, $6180
		fdb $6480, $6480, $6680, $6580,	$A01A, $6180, $A01A, $6480
		fdb $6480, $6480, $A01A, $6480,	$A01A, $A01A, $A01A, $A01A
		fdb $A01A, $A01A, $A01A, $A01A,	$6780, $6480, $6480, $A01A
		fdb $A01A, 0, 0, 0, 0, 0, 0, 0
		fdb 0, $6780, $6280, $6280, $6280, $6280, $6280, $6280
		fdb $6280, $6280, $6280, $6280,	$6780, $6780, $6280, $6280
		fdb $6280, $6280, $6280, $6280,	$6280, $6280, $6280, $6280
		fdb $6280, $6280, $6280, $6280,	$6280, $6280, $6280, $6280
		fdb $6280, $6280, $6280, $6280,	$6280, $6280, $6280, $6280
		fdb $6280, $6280, $6280, $6280,	$6280, $6280, $6280, $6280
		fdb $6280, $6280, $6280, $6280,	$6280, $6280, $6280, $6280
		fdb $6280, $6280, $6280, $6280,	$6280, $6280, $6280, $6280
		fdb $6280, $6280, $6280, $6280,	$6480, $6480, $6780, $6280
		fdb $6280, $6280, $6280, $6280,	$6280, $6280, $6280, $6280
		fdb $6280, $6280, $6280, $6280,	$6280, $6280, $6280, $6780
		fdb $6780, $6780, $6280, $6280,	$6280, $6280, $6280, $6280
		fdb $6280, $6280, $6280, $6280,	$6280, $6280, $6280, $6280
		fdb $6280, $6280, $6780, $6780,	$6780, $6780, $6780, $6780
		fdb $6780, $6780, $6780, $6780,	$6780, $6780, $6700, $6710
		fdb $6720, $6780, $6780, $6780,	$6780, $A01A

; =============== S U B	R O U T	I N E =======================================

; Attributes: noreturn

		; public BADIRQ
BADIRQ:
		bra	BADIRQ
; End of function BADIRQ


; =============== S U B	R O U T	I N E =======================================


		; public IRQ
IRQ:
		ldx	$A,s
		cmpx	#$6000		; Bounds check for return address in ROM
		bcc	loc_EF5E
		swi

loc_EF5E:				; Only allow IRQ calls from lower in ROM than BADIRQ function
		cmpx	#BADIRQ
		bcs	loc_EF64
		swi

loc_EF64:
		lda	#$48 ; 'H'
		tfr	a, dp
		sta	WDCLR
		lda	<DPSanity_Check	; Check	sanity byte is $3F
		cmpa	#$3F ; '?'
		beq	loc_EF72
		swi

loc_EF72:
		dec	<DPbyte_3E
		bpl	loc_EF7F
		lda	#$B
		sta	<DPbyte_3E
		inc	<DPbyte_3D
		bvc	loc_EF7F
		swi

loc_EF7F:
		inc	<DPbyte_A
		jsr	sub_D776	; Check	coin inputs
		lda	<DPbyte_14	; Credits
		cmpa	#$24 ; '$'
		bcs	loc_EF8B
		swi

loc_EF8B:
		ldx	#$481C
		lda	IO_Port_0
		jsr	sub_F133	; Inputs debounce
		lda	IO_Port_1
		jsr	sub_F133	; Inputs debounce
		lda	OPT0
		jsr	sub_F133	; Inputs debounce
		lda	OPT1
		jsr	sub_F133	; Inputs debounce
		lda	<DPbyte_33
		sta	<DPbyte_34
		lda	>word_4821
		anda	#$30 ; '0'
		sta	-1,s
		lda	>word_481E
		anda	#$CF ; 'œ'
		ora	-1,s
		sta	<DPbyte_33
		eora	<DPbyte_34
		anda	<DPbyte_34
		sta	<DPbyte_32
		lda	<DPbyte_32
		anda	#$F0 ; ''
		beq	loc_EFCA
		ora	<DPbyte_31
		sta	<DPbyte_31

loc_EFCA:				; Joystick processing
		jsr	sub_F146
		lda	<DPbyte_A
		bne	loc_EFE6
		lda	SOUNDIO+1
		asla
		bpl	loc_EFDE
		lda	SOUNDIO
		cmpa	#$5A ; 'Z'
		beq	loc_EFE6

loc_EFDE:
		sta	SOUNDRST
		lda	#0
		sta	SOUNDIO

loc_EFE6:
		lda	<DPbyte_A
		anda	#3
		bne	loc_F034
		lda	>word_481B
		adda	#1
		cmpa	#$FA ; '˙'
		bcs	loc_EFF7
		lda	#0

loc_EFF7:
		sta	>byte_481B
		bne	loc_F034
		lda	>byte_481A
		adda	#1
		daa
		sta	>byte_481A
		lda	>byte_4819
		adca	#0
		daa
		bcs	loc_F010
		sta	>byte_4819

loc_F010:
		lda	byte_4B07
		adda	#1
		daa
		sta	byte_4B07
		lda	byte_4B06
		adca	#0
		daa
		sta	byte_4B06
		lda	byte_4B05
		adca	#0
		daa
		sta	byte_4B05
		lda	byte_4B04
		adca	#0
		daa
		sta	byte_4B04

loc_F034:
		dec	<DPbyte_40
		bvc	loc_F041
		sta	EVGRESET
		jsr	sub_611E	; Copies Star Wars logo	vector data to vector RAM
		jmp	loc_F12F
; ---------------------------------------------------------------------------

loc_F041:
		lbpl	loc_F12F
		lda	IO_Port_1
		asla
		lbpl	loc_F12F	; If VGHALT is high, VG	is ready
		lda	<DPbyte_3F	; Vector pointer state
		bpl	loc_F06A
		lda	>$0000
		anda	#$A
		beq	loc_F05A
		lda	#$14

loc_F05A:				; What the heck	is going on here???
		ora	#0
		sta	<DPbyte_3F	; Vector pointer state
		ldb	#$38 ; '8'
		lsra
		anda	#$A
		eora	#$A
		ora	#$E0 ; '‡'
		std	>$0000		; Seems	to toggle vector address $0000 from $E038 and $EA38 JMPL $038 and $A38

loc_F06A:
		dec	<DPbyte_28
		bpl	loc_F073
		clr	<DPbyte_28
		jsr	sub_F18D

loc_F073:
		jsr	sub_F22B
		ldb	<DPbyte_3A
		addb	#2
		cmpb	#$20 ; ' '
		bcs	loc_F07F
		clrb

loc_F07F:				; Colour cycle blue/cyan for lasers
		stb	<DPbyte_3A
		ldx	#4
		abx			; Points to jump table that jump into vector ROM for laser colour cycle
		ldu	#word_D620	; Copies vector	JMPL instructions into vector RAM

loc_F088:
		ldd	,u++
		std	,--x
		cmpx	#2
		bgt	loc_F088
		ldx	#$22 ; '"'

loc_F094:
		cmpu	#word_D640
		bcc	loc_F0A0
		ldd	,u++
		std	,--x
		bra	loc_F094
; ---------------------------------------------------------------------------

loc_F0A0:
		ldb	<DPbyte_3B
		addb	#2
		cmpb	#8
		bcs	loc_F0A9
		clrb

loc_F0A9:
		stb	<DPbyte_3B
		ldu	#word_D640
		ldd	b,u
		std	>$0022
		dec	<DPbyte_36
		bgt	loc_F0D8
		ldb	#4
		stb	<DPbyte_36
		ldb	<DPbyte_37
		addb	#2
		cmpb	#8
		bcs	loc_F0C4
		clrb

loc_F0C4:
		stb	<DPbyte_37
		ldu	#word_D648
		ldd	b,u
		std	>$002A
		ldb	<DPbyte_37
		ldu	#word_D650
		ldd	b,u
		std	>$002E

loc_F0D8:
		dec	<DPbyte_38
		bgt	loc_F0F3
		ldb	#1
		stb	<DPbyte_38
		ldb	<DPbyte_39
		addb	#2
		cmpb	#8
		bcs	loc_F0E9
		clrb

loc_F0E9:
		stb	<DPbyte_39
		ldu	#word_D658
		ldd	b,u
		std	>$002C

loc_F0F3:
		ldb	<DPbyte_35
		addb	#2
		cmpb	#$E
		bcs	loc_F0FC
		clrb

loc_F0FC:
		stb	<DPbyte_35
		ldu	#word_D604
		ldd	b,u
		std	>$0030
		ldd	#$C000		; Vector RTSL
		std	>$0032
		ldb	<DPbyte_3C	; Cycle	through	7 colours
		addb	#2
		cmpb	#$E
		bcs	loc_F115
		clrb

loc_F115:				; Vector colour	cycle count
		stb	<DPbyte_3C
		ldu	#word_D612
		ldd	b,u
		std	>$0034
		ldd	#$C000		; Vector RTSL
		std	>$0036
		jsr	sub_D660	; Update laser target hit vector animations
		sta	EVGGO		; Start	vector generator run
		lda	#5
		sta	<DPbyte_40

loc_F12F:
		sta	IRQCLR
		rti
; End of function IRQ


; =============== S U B	R O U T	I N E =======================================

; Inputs debounce

sub_F133:
		ldb	,x		; Inputs debounce
		stb	1,x
		sta	,x
		anda	1,x
		ora	2,x
		sta	2,x
		orb	,x++
		andb	,x
		stb	,x+
		rts
; End of function sub_F133


; =============== S U B	R O U T	I N E =======================================

; Joystick processing

sub_F146:
		lda	<DPbyte_A
		lsra
		ldy	#$4829
		bcs	loc_F153
		ldy	#$482B

loc_F153:
		ldb	1,y
		lda	ADC
		sta	1,y
		cmpa	,y
		bcs	loc_F16C
		cmpb	,y
		bls	loc_F16A
		cmpb	1,y
		bls	loc_F168
		ldb	1,y

loc_F168:
		stb	,y

loc_F16A:
		bra	loc_F178
; ---------------------------------------------------------------------------

loc_F16C:
		cmpb	,y
		bcc	loc_F178
		cmpb	1,y
		bcc	loc_F176
		ldb	1,y

loc_F176:
		stb	,y

loc_F178:
		cmpy	#byte_4829
		bne	loc_F186
		sta	ADCSTART
		sta	ADCSTART
		bra	locret_F18C
; ---------------------------------------------------------------------------

loc_F186:
		sta	ADCSTART+1
		sta	ADCSTART+1

locret_F18C:
		rts
; End of function sub_F146


; =============== S U B	R O U T	I N E =======================================


sub_F18D:
		ldx	#byte_4866
		lda	<DPbyte_2B	; Joystick Y
		nop
		jsr	sub_F1C6
		lda	4,x
		cmpa	#$78 ; 'x'
		ble	loc_F19E
		lda	#$78 ; 'x'

loc_F19E:
		cmpa	#$98 ; 'ò'
		bge	loc_F1A4
		lda	#$98 ; 'ò'

loc_F1A4:
		sta	4,x
		jsr	sub_F1FD
		ldx	#byte_486F
		lda	<DPbyte_29	; Joystick X
		nop
		jsr	sub_F1C6
		lda	4,x
		cmpa	#$70 ; 'p'
		ble	loc_F1BA
		lda	#$70 ; 'p'

loc_F1BA:
		cmpa	#$90 ; 'ê'
		bge	loc_F1C0
		lda	#$90 ; 'ê'

loc_F1C0:
		sta	4,x
		jsr	sub_F1FD
		rts
; End of function sub_F18D


; =============== S U B	R O U T	I N E =======================================


sub_F1C6:
		cmpa	,x
		bcc	loc_F1D0
		cmpa	1,x
		bcs	loc_F1D0
		dec	,x

loc_F1D0:
		sta	1,x
		cmpa	,x
		bcc	loc_F1D8
		lda	,x

loc_F1D8:
		suba	,x
		sta	<DPbyte_51
		ldb	2,x
		mul
		adda	<DPbyte_51
		bne	loc_F1E5
		lda	#1

loc_F1E5:
		bcs	loc_F1EB
		clr	3,x
		bra	loc_F1F7
; ---------------------------------------------------------------------------

loc_F1EB:
		lda	#$FF
		inc	3,x
		ldb	3,x
		cmpb	#2
		bcs	loc_F1F7
		dec	2,x

loc_F1F7:
		clrb
		suba	#$80 ; 'Ä'
		sta	4,x
		rts
; End of function sub_F1C6


; =============== S U B	R O U T	I N E =======================================


sub_F1FD:
		clr	<DPbyte_51
		lda	4,x
		ldb	#$80 ; 'Ä'
		subd	5,x
		bge	loc_F20A
		nega
		dec	<DPbyte_51

loc_F20A:
		ble	loc_F20F
		addd	#$FF

loc_F20F:
		cmpa	#$F8 ; '¯'
		bls	loc_F215
		lda	#$F8 ; '¯'

loc_F215:
		ldb	#$60 ; '`'
		cmpa	#$40 ; '@'
		bcc	loc_F21D
		ldb	#$30 ; '0'

loc_F21D:
		mul
		tst	<DPbyte_51
		bpl	loc_F226
		coma
		negb
		sbca	#$FF

loc_F226:
		addd	5,x
		std	5,x
		rts
; End of function sub_F1FD


; =============== S U B	R O U T	I N E =======================================


sub_F22B:
		ldb	<DPbyte_6B
		lda	<DPbyte_6C
		anda	#$C0 ; '¿'
		asla
		rolb
		bcc	loc_F237
		ora	#$3F ; '?'

loc_F237:
		rola
		rolb
		rola
		std	<DPbyte_2F
		addd	#$FF98
		anda	#$1F
		std	>$0024
		ldb	<DPbyte_74
		lda	<DPbyte_75
		anda	#$C0 ; '¿'
		asla
		rolb
		bcc	loc_F250
		ora	#$3F ; '?'

loc_F250:
		rola
		rolb
		rola
		std	<DPbyte_2D
		anda	#$1F
		std	>$0026
		ldd	#$C000
		std	>$0028
		rts
; End of function sub_F22B

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_6532

		; public Reset
Reset:
		orcc	#$10
		clr	MPAGE
		lda	#0
		sta	LED1
		sta	LED2
		sta	LED3
		lda	#0
		sta	PRNGClr
		lda	#$80 ; 'Ä'
		sta	PRNGClr
		sta	EVGRESET
		ldu	#0

loc_F281:
		sta	WDCLR
		leau	-1,u
		cmpu	#0
		bne	loc_F281
		lds	#$4FFF		; Stack	top at $4FFF
		lda	#$48 ; 'H'      ; Direct Page at $4800
		tfr	a, dp
		sta	SOUNDRST
		lda	#0
		sta	SOUNDIO
		ldx	#$4800
		ldd	#0

loc_F2A2:
		std	,x++
		cmpx	#$5000
		bcs	loc_F2A2
		sta	WDCLR
		ldx	#$5000
		ldd	#0

loc_F2B2:
		std	,x++
		sta	WDCLR
		cmpx	#$6000
		bcs	loc_F2B2
		ldx	#0
		ldd	#0

loc_F2C2:
		std	,x++
		sta	WDCLR
		cmpx	#$3000
		bcs	loc_F2C2
		lda	IO_Port_0	; Check	self test switch
		anda	#$10
		bne	loc_F2D6
		jmp	loc_F36E
; ---------------------------------------------------------------------------

loc_F2D6:				; Read option switches
		lda	OPT0
		ldb	OPT1

loc_F2DC:
		sta	<Opt0_Shad
		stb	<Opt1_Shad	; Store	in shadow RAM
		ldx	#$800

loc_F2E3:
		leax	-1,x
		bne	loc_F2E3
		lda	OPT0
		ldb	OPT1
		cmpa	<Opt0_Shad
		bne	loc_F2DC
		cmpb	<Opt1_Shad
		bne	loc_F2DC
		ldd	#$2020
		ldx	#0

loc_F2FB:				; Clear	vector RAM to HALT instructions
		std	,x++
		sta	WDCLR
		cmpx	#$2800
		bcs	loc_F2FB
		ldd	#$E038		; Set up first vector instruction to JSRL 38
		std	>$0000
		lda	#$FF
		sta	<DPbyte_3F	; Vector pointer state
		lda	#$3F ; '?'
		sta	<DPSanity_Check
		lda	#$40 ; '@'
		sta	<DPbyte_28
		jsr	sub_C306	; Read NOVRAM
		sta	WDCLR
		lda	#$FF
		sta	LED1
		sta	LED2
		sta	LED3
		sta	IRQCLR
		jmp	loc_6036	; Jump to main game loop
; END OF FUNCTION CHUNK	FOR sub_6532
; ---------------------------------------------------------------------------
word_F32E:	fdb $4800
		fdb $5000
word_F332:	fdb $5001
word_F334:	fdb 0
		fdb $800
		fdb $1000
		fdb $1800
		fdb $2000
		fdb $2800
off_F340:	fdb byte_4500		; NOVRAM
word_F342:	fdb $6000
word_F344:	fdb $8000
		fdb $A000
		fdb $C000
		fdb $E000
word_F34C:	fdb $2800
word_F34E:	fdb 1, 2, 4, 8,	$10, $20, $40, $80
		fdb $100, $200,	$400, $800, $1000, $2000, $4000, $8000
; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_6532

loc_F36E:				; Self test
		lda	IO_Port_1
		anda	#4
		bne	loc_F380	; Check	Aux coin
		lda	OPT0
		coma
		anda	#$7F ; ''
		beq	loc_F380
		jmp	Check_Test_Diag
; ---------------------------------------------------------------------------

loc_F380:
		lds	#0
		ldu	#word_F32E

loc_F387:
		ldx	,u++
		ldy	#$800

loc_F38D:
		lda	,x
		beq	loc_F39D
		tfr	s, d
		ora	$1E,u
		orb	$1F,u
		tfr	d, s
		bra	loc_F3DC
; ---------------------------------------------------------------------------

loc_F39D:
		lda	#$80 ; 'Ä'
		asla

loc_F3A0:
		rola
		sta	,x
		tfr	a, b
		eorb	,x
		beq	loc_F3B5
		tfr	s, d
		ora	$1E,u
		orb	$1F,u
		tfr	d, s
		bra	loc_F3DC
; ---------------------------------------------------------------------------

loc_F3B5:
		bcc	loc_F3BE
		tsta
		bne	loc_F3A0
		adda	#$FF
		bra	loc_F3A0
; ---------------------------------------------------------------------------

loc_F3BE:
		tfr	a, b
		incb
		bne	loc_F3A0
		sta	WDCLR
		cmpu	#word_F332
		beq	loc_F3D2
		cmpu	#word_F334
		bne	loc_F3D6

loc_F3D2:
		leax	2,x
		bra	loc_F3D8
; ---------------------------------------------------------------------------

loc_F3D6:
		leax	1,x

loc_F3D8:
		leay	-1,y
		bne	loc_F38D

loc_F3DC:
		cmpu	#off_F340
		bcs	loc_F387
		ldu	#word_F32E

loc_F3E5:
		ldx	,u++
		ldy	#$800

loc_F3EB:
		inc	,x
		beq	loc_F3FB
		tfr	s, d
		ora	$1E,u
		orb	$1F,u
		tfr	d, s
		bra	loc_F424
; ---------------------------------------------------------------------------

loc_F3FB:
		lda	,x
		beq	loc_F40B
		tfr	s, d
		ora	$1E,u
		orb	$1F,u
		tfr	d, s
		bra	loc_F424
; ---------------------------------------------------------------------------

loc_F40B:
		sta	WDCLR
		cmpu	#$F332
		beq	loc_F41A
		cmpu	#$F334
		bne	loc_F41E

loc_F41A:
		leax	2,x
		bra	loc_F420
; ---------------------------------------------------------------------------

loc_F41E:
		leax	1,x

loc_F420:
		leay	-1,y
		bne	loc_F3EB

loc_F424:
		cmpu	#off_F340
		bcs	loc_F3E5
		tfr	s, d
		andb	#1
		bne	loc_F43F
		ldx	#byte_4500	; NOVRAM
		ldu	#Scratch_RAM_start

loc_F436:
		ldd	,x++
		std	,u++
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_F436

loc_F43F:
		ldu	#word_F342
		ldx	#byte_4500	; NOVRAM
		ldd	#0

loc_F448:
		std	,x++
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_F448
		ldx	#byte_4500	; NOVRAM

loc_F452:
		lda	,x
		anda	#$F
		beq	loc_F464
		tfr	s, d
		ora	$1E,u
		orb	$1F,u
		tfr	d, s
		bra	loc_F4B7
; ---------------------------------------------------------------------------

loc_F464:
		lda	#$80 ; 'Ä'
		asla
		ldy	#4

loc_F46B:
		rola
		sta	,x
		tfr	a, b
		eorb	,x
		andb	#$F
		beq	loc_F482
		tfr	s, d
		ora	$1E,u
		orb	$1F,u
		tfr	d, s
		bra	loc_F4B7
; ---------------------------------------------------------------------------

loc_F482:
		leay	-1,y
		bne	loc_F46B
		tsta
		bmi	loc_F491
		lda	#$FF
		ldy	#5
		bra	loc_F46B
; ---------------------------------------------------------------------------

loc_F491:
		sta	WDCLR
		leax	1,x
		cmpx	#byte_4500+$100	; NOVRAM
		bcs	loc_F452
		ldx	#byte_4500	; NOVRAM

loc_F49E:
		inc	,x
		lda	,x+
		anda	#$F
		beq	loc_F4B2
		tfr	s, d
		ora	$1E,u
		orb	$1F,u
		tfr	d, s
		bra	loc_F4B7
; ---------------------------------------------------------------------------

loc_F4B2:				; NOVRAM
		cmpx	#byte_4500+$100
		bcs	loc_F49E

loc_F4B7:
		tfr	s, d
		andb	#1
		bne	loc_F4CE
		ldx	#Scratch_RAM_start
		ldu	#byte_4500	; NOVRAM

loc_F4C3:
		ldd	,x++
		std	,u++
		cmpx	#Scratch_RAM_start+$100
		bcs	loc_F4C3
		bra	loc_F4EC
; ---------------------------------------------------------------------------

loc_F4CE:
		lda	#$FF
		sta	NVRecall
		ldx	#$100

loc_F4D6:
		sta	WDCLR
		leax	-1,x
		bne	loc_F4D6
		lda	#0
		sta	NVRecall
		ldx	#$A000

loc_F4E5:
		sta	WDCLR
		leax	-1,x
		bne	loc_F4E5

loc_F4EC:
		sta	WDCLR
		lda	#0
		sta	MPAGE
		ldx	word_F342
		ldy	#$2000
		tfr	x, d

loc_F4FD:
		adcb	1,x
		adca	,x++
		sta	WDCLR
		leay	-2,y
		bne	loc_F4FD
		tfr	d, x
		lda	#$FF
		sta	MPAGE
		ldu	#word_F344
		tfr	x, d
		ldy	#$2000
		ldx	word_F342
		bra	loc_F528
; END OF FUNCTION CHUNK	FOR sub_6532

; =============== S U B	R O U T	I N E =======================================


sub_F51D:
		ldu	#$F344
; End of function sub_F51D

; START	OF FUNCTION CHUNK FOR sub_6532

loc_F520:
		ldx	,u++
		ldy	#$2000

loc_F526:
		tfr	x, d

loc_F528:
		adcb	1,x
		adca	,x++
		sta	WDCLR
		leay	-2,y
		bne	loc_F528
		std	$5593,u
		beq	loc_F543
		tfr	s, d
		ora	$1E,u
		orb	$1F,u
		tfr	d, s

loc_F543:
		cmpu	#word_F34C
		bcs	loc_F520
		cmpu	#word_F34E
		bcc	loc_F557
		ldx	,u++
		ldy	#$1000
		bra	loc_F526
; ---------------------------------------------------------------------------

loc_F557:
		lda	#$FF
		sta	LED1
		sta	LED2
		sta	LED3
		clr	<DPbyte_D1
		lda	IO_Port_1
		anda	#4
		bne	loc_F56E
		jmp	Check_Test_Diag
; ---------------------------------------------------------------------------

loc_F56E:
		sta	WDCLR
		sts	<DPbyte_D2
		tfr	s, d
		andb	#1
		bne	loc_F5ED
		ldy	#0
		ldd	#$6000
		std	,y++
		ldd	#$BFAE
		std	,y++
		ldd	#$8040
		std	,y++
		lda	#$48 ; 'H'
		tfr	a, dp
		sts	<DPbyte_CC
		lds	#$4FFF
		ldb	#$D3 ; '”'
		jsr	sub_E7C7	; Print	text string from pointer table
		ldb	#$B0 ; '∞'
		jsr	sub_E7C7	; Print	text string from pointer table
		ldb	#$B2 ; '≤'
		stb	<DPbyte_CE
		ldd	<DPbyte_CC
		bne	loc_F5B1
		ldb	#$B1 ; '±'
		jsr	sub_E7C7	; Print	text string from pointer table
		bra	loc_F5EB
; ---------------------------------------------------------------------------

loc_F5B1:
		lsra
		rorb
		std	<DPbyte_CC
		bcc	loc_F5E5
		ldb	<DPbyte_CE
		jsr	sub_E7C7	; Print	text string from pointer table
		ldb	<DPbyte_CE
		subb	#$BC ; 'º'
		bcs	loc_F5E5
		aslb
		ldx	#$F743
		abx
		ldu	,x
		stu	,y++
		ldu	#$120
		stu	,y++
		ldx	#$48D7
		abx
		lda	,x+
		coma
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	,x
		coma
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	#$8040
		std	,y++

loc_F5E5:
		inc	<DPbyte_CE
		ldd	<DPbyte_CC
		bne	loc_F5B1

loc_F5EB:
		bra	loc_F643
; ---------------------------------------------------------------------------

loc_F5ED:
		ldx	#8
		tfr	s, d

loc_F5F2:
		lsrb
		bcc	loc_F5F9
		lda	#$29 ; ')'
		bra	loc_F5FB
; ---------------------------------------------------------------------------

loc_F5F9:
		lda	#$3B ; ';'

loc_F5FB:
		sta	SOUNDIO
		ldu	#0

loc_F601:
		stb	WDCLR
		leau	1,u
		cmpu	#$A000
		bcs	loc_F601
		leax	-1,x
		bne	loc_F5F2
		ldx	#8
		tfr	s, d

loc_F615:
		lsra
		bcc	loc_F61C
		ldb	#$29 ; ')'
		bra	loc_F61E
; ---------------------------------------------------------------------------

loc_F61C:
		ldb	#$3B ; ';'

loc_F61E:
		stb	SOUNDIO
		ldu	#0

loc_F624:
		sta	WDCLR
		leau	1,u
		cmpu	#$A000
		bcs	loc_F624
		leax	-1,x
		bne	loc_F615
		ldu	#0

loc_F636:
		sta	WDCLR
		leau	1,u
		cmpu	#$FF00
		bcs	loc_F636
		bra	loc_F5ED
; ---------------------------------------------------------------------------

loc_F643:
		ldd	#$2020
		std	,y++
		ldu	#off_F723
		clr	<DPbyte_C0
		lda	#3
		sta	<DPbyte_C5
		sta	<DPbyte_C6
		sta	<DPbyte_C7
		sta	<DPbyte_D6
		ldx	#word_F34E
		stx	<DPbyte_D4

loc_F65C:
		ldd	#1
		ldx	#0

loc_F662:
		sta	WDCLR
		leax	d,x
		cmpx	#$708
		bcs	loc_F662
		sta	EVGRESET
		lda	IO_Port_1
		anda	#4
		bne	loc_F679
		jmp	loc_F720
; ---------------------------------------------------------------------------

loc_F679:
		lda	IO_Port_0
		anda	#4
		bne	loc_F69F
		lda	<DPbyte_C5
		beq	loc_F69D
		deca
		bne	loc_F69D
		leau	2,u
		cmpu	#word_F735
		bcs	loc_F692
		ldu	#off_F725

loc_F692:
		ldd	#0
		std	<DPbyte_C2
		sta	<DPbyte_C4
		sta	<DPbyte_C0
		lda	#$80 ; 'Ä'

loc_F69D:
		bra	loc_F6A1
; ---------------------------------------------------------------------------

loc_F69F:
		lda	#3

loc_F6A1:
		sta	<DPbyte_C5
		lda	IO_Port_0
		coma
		anda	#$C0 ; '¿'
		beq	loc_F6C7
		lda	<DPbyte_C6
		beq	loc_F6C5
		deca
		bne	loc_F6C5
		ldb	<DPbyte_C0
		addb	#2
		cmpb	#$E
		bcs	loc_F6BB
		clrb

loc_F6BB:
		stb	<DPbyte_C0
		cmpb	#4
		bne	loc_F6C3
		clr	<DPbyte_C1

loc_F6C3:
		lda	#$80 ; 'Ä'

loc_F6C5:
		bra	loc_F6C9
; ---------------------------------------------------------------------------

loc_F6C7:
		lda	#3

loc_F6C9:
		sta	<DPbyte_C6
		cmpu	#off_F733
		bne	loc_F6F0
		lda	IO_Port_1
		coma
		anda	#$30 ; '0'
		beq	loc_F6EA
		lda	<DPbyte_C7
		beq	loc_F6E8
		deca
		bne	loc_F6E8
		ldb	<DPbyte_C1
		eorb	#1
		stb	<DPbyte_C1
		lda	#$80 ; 'Ä'

loc_F6E8:
		bra	loc_F6EC
; ---------------------------------------------------------------------------

loc_F6EA:
		lda	#3

loc_F6EC:
		sta	<DPbyte_C7
		bra	loc_F6F2
; ---------------------------------------------------------------------------

loc_F6F0:
		clr	<DPbyte_C1

loc_F6F2:
		ldy	#0
		ldb	<DPbyte_C0
		ldx	#word_F735
		ldd	b,x
		cmpd	#$6780
		bne	loc_F709
		tst	<DPbyte_C1
		beq	loc_F709
		ldb	#$20 ; ' '

loc_F709:
		std	,y++
		jmp	[,u]
; END OF FUNCTION CHUNK	FOR sub_6532

; =============== S U B	R O U T	I N E =======================================


sub_F70D:
		ldd	#$2020
		std	,y++
		std	,y++

loc_F714:
		sta	EVGGO
		lda	IO_Port_0
		anda	#$10
		lbeq	loc_F65C
; End of function sub_F70D

; START	OF FUNCTION CHUNK FOR sub_6532

loc_F720:
		jmp	loc_F720
; END OF FUNCTION CHUNK	FOR sub_6532
; ---------------------------------------------------------------------------
off_F723:	fdb sub_F74F
off_F725:	fdb sub_F77F
off_F727:	fdb sub_F958, sub_F88C,	sub_F884, sub_F894, sub_F8AA, sub_F8CC
off_F733:	fdb sub_F93F
word_F735:	fdb $6480, $6280, $6180, $6580,	$6780, $6680, $6380, $1F38
		fdb $1F06, $1ED4, $1EA2, $1E70,	$1F6A

; =============== S U B	R O U T	I N E =======================================


sub_F74F:
		dec	<DPbyte_D6
		bpl	loc_F77C
		lda	#$10
		sta	<DPbyte_D6
		ldx	<DPbyte_D4
		ldd	<DPbyte_D2
		anda	,x
		bne	loc_F767
		andb	1,x
		bne	loc_F767
		lda	#$3B ; ';'
		bra	loc_F769
; ---------------------------------------------------------------------------

loc_F767:
		lda	#$29 ; ')'

loc_F769:
		sta	SOUNDIO
		leax	2,x
		cmpx	#word_F34E+$20
		bcs	loc_F77A
		lda	#$20 ; ' '
		sta	<DPbyte_D6
		ldx	#word_F34E

loc_F77A:
		stx	<DPbyte_D4

loc_F77C:
		jmp	loc_F714
; End of function sub_F74F


; =============== S U B	R O U T	I N E =======================================


sub_F77F:
		sta	ADCSTART
		sta	ADCSTART
		ldd	#$BFAE
		std	,y++
		ldd	#$8040
		std	,y++
		lds	#$4FFF
		ldb	#$9E ; 'û'
		jsr	sub_E7C7	; Print	text string from pointer table
		ldb	#$D3 ; '”'
		jsr	sub_E7C7	; Print	text string from pointer table
		ldb	#$9F ; 'ü'
		stb	<DPbyte_CE
		lda	IO_Port_0
		ldb	IO_Port_1
		orb	#$C7 ; '«'
		std	<DPbyte_CC

loc_F7AB:
		aslb
		rola
		std	<DPbyte_CC
		bcs	loc_F7B6
		ldb	<DPbyte_CE
		jsr	sub_E7C7	; Print	text string from pointer table

loc_F7B6:
		inc	<DPbyte_CE
		ldd	<DPbyte_CC
		bne	loc_F7AB
		ldd	<DPbyte_C8
		std	<DPbyte_CA
		lda	IO_Port_0
		anda	#$CF ; 'œ'
		ldb	IO_Port_1
		andb	#$3A ; ':'
		std	<DPbyte_C8
		eora	<DPbyte_CA
		anda	<DPbyte_CA
		eorb	<DPbyte_CB
		andb	<DPbyte_CB
		cmpd	#0
		beq	loc_F7DF
		lda	#$3B ; ';'
		sta	SOUNDIO

loc_F7DF:
		ldd	#$1EA2
		std	,y++
		ldd	#$1F74
		std	,y++
		lda	#$10
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	word_301E
		std	,y++
		ldd	word_3002
		std	,y++
		lda	OPT0
		jsr	sub_F86C
		ldd	#$1E70
		std	,y++
		ldd	#$1F5C
		std	,y++
		lda	#$10
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	word_3020
		std	,y++
		ldd	word_3020+2
		std	,y++
		ldd	word_3002
		std	,y++
		lda	OPT1
		jsr	sub_F86C
		ldb	#$AF ; 'Ø'
		jsr	sub_E7C7	; Print	text string from pointer table
		ldd	#$BFD5
		std	,y++
		ldd	#0
		std	,y++
		ldd	#$140
		std	,y++
		ldb	ADC
		subb	#$80 ; 'Ä'
		sex
		tfr	d, u
		asra
		rorb
		leau	d,u
		tfr	u, d
		anda	#$1F
		std	,y++
		sta	ADCSTART+1
		sta	ADCSTART+1
		ldx	#$14

loc_F851:
		leax	-1,x
		bne	loc_F851
		ldb	ADC
		subb	#$80 ; 'Ä'
		sex
		anda	#$1F
		ora	#$E0 ; '‡'
		std	,y++
		ldd	#$8040
		std	,y++
		ldu	#off_F725
		jmp	sub_F70D
; End of function sub_F77F


; =============== S U B	R O U T	I N E =======================================


sub_F86C:
		ldb	#7

loc_F86E:
		lsra
		bcc	loc_F876
		ldx	word_3020+2
		bra	loc_F879
; ---------------------------------------------------------------------------

loc_F876:
		ldx	word_3032

loc_F879:
		stx	,y++
		decb
		bpl	loc_F86E
		ldd	#$8040
		std	,y++
		rts
; End of function sub_F86C


; =============== S U B	R O U T	I N E =======================================


sub_F884:
		ldd	#$BF20
		std	,y++
		jmp	sub_F70D
; End of function sub_F884


; =============== S U B	R O U T	I N E =======================================


sub_F88C:
		ldd	#$BEFD
		std	,y++
		jmp	sub_F70D
; End of function sub_F88C


; =============== S U B	R O U T	I N E =======================================


sub_F894:
		ldd	#$BEA7
		std	,y++
		ldb	#$CE ; 'Œ'

loc_F89B:
		stb	<DPbyte_CE
		jsr	sub_E7C7	; Print	text string from pointer table
		ldb	<DPbyte_CE
		incb
		cmpb	#$D3 ; '”'
		bcs	loc_F89B
		jmp	sub_F70D
; End of function sub_F894


; =============== S U B	R O U T	I N E =======================================


sub_F8AA:
		ldd	#$BFAE
		std	,y++
		ldd	#$BFB3
		std	,y++
		std	,y++
		std	,y++
		std	,y++
		ldd	#$8040
		std	,y++
		ldb	#$C9 ; '…'
		jsr	sub_E7C7	; Print	text string from pointer table
		ldb	#$CA ; ' '
		jsr	sub_E7C7	; Print	text string from pointer table
		jmp	sub_F70D
; End of function sub_F8AA


; =============== S U B	R O U T	I N E =======================================


sub_F8CC:
		lda	<DPbyte_C6
		cmpa	#1
		bhi	loc_F8D9
		ldd	#0
		std	<DPbyte_C2
		sta	<DPbyte_C4

loc_F8D9:
		ldd	#$6000
		std	,y++
		ldd	#$BFAF
		std	,y++
		ldd	#$8040
		std	,y++
		ldd	<DPbyte_C2
		addd	#1
		tst	<DPbyte_C4
		bne	loc_F900
		cmpb	#$FC ; '¸'
		bcs	loc_F8FC
		lda	#1
		sta	<DPbyte_C4
		ldd	#0

loc_F8FC:
		std	<DPbyte_C2
		bra	loc_F917
; ---------------------------------------------------------------------------

loc_F900:
		cmpb	#$B0 ; '∞'
		bcs	loc_F906
		clrb
		inca

loc_F906:
		cmpa	#8
		bcs	loc_F90F
		clr	<DPbyte_C4
		ldd	#0

loc_F90F:
		std	<DPbyte_C2
		cmpb	#$7F ; ''
		bcs	loc_F917
		ldb	#$7F ; ''

loc_F917:
		ora	#$70 ; 'p'
		std	,y++
		ldd	#$6280
		std	,y++
		ldd	#$BFBC
		std	,y++
		ldd	#$7200
		std	,y++
		ldb	<DPbyte_C4
		bne	loc_F932
		ldb	#$CC ; 'Ã'
		bra	loc_F934
; ---------------------------------------------------------------------------

loc_F932:
		ldb	#$CD ; 'Õ'

loc_F934:				; Print	text string from pointer table
		jsr	sub_E7C7
		ldb	#$CB ; 'À'
		jsr	sub_E7C7	; Print	text string from pointer table
		jmp	sub_F70D
; End of function sub_F8CC


; =============== S U B	R O U T	I N E =======================================


sub_F93F:
		ldd	#$BFC8
		std	,y++
		ldx	#$38 ; '8'
		ldd	#$BFCC

loc_F94A:
		std	,y++
		leax	-1,x
		bne	loc_F94A
		ldd	#$8040
		std	,y++
		jmp	sub_F70D
; End of function sub_F93F


; =============== S U B	R O U T	I N E =======================================


sub_F958:
		ldd	#$BFAE
		std	,y++
		ldd	#$8040
		std	,y++
		ldd	#$7200
		std	,y++
		lds	#$4FFF
		ldb	#$C2 ; '¬'
		jsr	sub_E7C7	; Print	text string from pointer table
		lda	#$5D ; ']'
		sta	MW0
		tst	IO_Port_1
		bpl	loc_F97F
		tst	IO_Port_1
		bpl	loc_F98A

loc_F97F:
		ldb	#$C3 ; '√'
		jsr	sub_E7C7	; Print	text string from pointer table
		ldu	#off_F727
		jmp	sub_F70D
; ---------------------------------------------------------------------------

loc_F98A:
		ldd	#$6280
		std	,y++
		clr	<DPbyte_CC
		ldx	#word_FB4B

loc_F994:
		lds	#sub_F99B
		jmp	loc_FB38
; End of function sub_F958


; =============== S U B	R O U T	I N E =======================================


sub_F99B:
		beq	loc_FA19
		std	<DPbyte_D2
		inc	<DPbyte_CC
		lds	#$4FFF
		ldd	6,x
		std	,y++
		ldd	#$1E98
		std	,y++
		ldd	word_3032
		std	,y++
		std	,y++
		std	,y++
		std	,y++
		ldd	word_3002
		std	,y++
		tfr	x, d
		subd	#$FB4B
		aslb
		lda	#3

loc_F9C6:
		aslb
		bcs	loc_F9CE
		ldu	word_3020+2
		bra	loc_F9D1
; ---------------------------------------------------------------------------

loc_F9CE:
		ldu	word_3032

loc_F9D1:
		stu	,y++
		deca
		bpl	loc_F9C6
		ldd	word_3002
		std	,y++
		std	,y++
		lda	,x
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	1,x
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	word_3002
		std	,y++
		lda	2,x
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	3,x
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	word_3002
		std	,y++
		lda	4,x
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	5,x
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	word_3002
		std	,y++
		lda	<DPbyte_D2
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	<DPbyte_D3
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	#$8040
		std	,y++

loc_FA19:
		leax	8,x
		cmpx	#word_FB73
		lbcs	loc_F994
		lds	#$4FFF
		tst	<DPbyte_CC
		bne	loc_FA2E
		ldb	#$C5 ; '≈'
		bra	loc_FA35
; ---------------------------------------------------------------------------

loc_FA2E:
		ldb	#$C4 ; 'ƒ'
		jsr	sub_E7C7	; Print	text string from pointer table
		ldb	#$C6 ; '∆'

loc_FA35:				; Print	text string from pointer table
		jsr	sub_E7C7
		ldx	#off_FAE1
		clr	<DPbyte_CC
		ldd	#$6480
		std	,y++

loc_FA42:
		tfr	x, d
		subd	#off_FAE9
		lsrb
		lds	#sub_FA4E
		jmp	[,x]
; End of function sub_F99B


; =============== S U B	R O U T	I N E =======================================


sub_FA4E:
		beq	loc_FAC1
		std	<DPbyte_D2
		inc	<DPbyte_CC
		cmpx	#off_FAF9
		bcc	loc_FA92
		ldd	2,x
		std	,y++
		ldd	#$1EA2
		std	,y++
		ldd	word_3032
		std	,y++
		std	,y++
		std	,y++
		ldd	word_3020+2
		std	,y++
		ldd	word_3002
		std	,y++
		tfr	x, d
		subd	#off_FAE1
		aslb
		aslb
		addb	#$50 ; 'P'
		lda	#3

loc_FA80:
		aslb
		bcs	loc_FA88
		ldu	word_3020+2
		bra	loc_FA8B
; ---------------------------------------------------------------------------

loc_FA88:
		ldu	word_3032

loc_FA8B:
		stu	,y++
		deca
		bpl	loc_FA80
		bra	loc_FAA9
; ---------------------------------------------------------------------------

loc_FA92:
		ldd	2,x
		std	,y++
		ldd	#$96 ; 'ñ'
		std	,y++
		tfr	x, d
		subd	#off_FAF9
		lsrb
		lds	#$3018
		ldd	b,s
		std	,y++

loc_FAA9:
		ldd	word_3002
		std	,y++
		lds	#$4FFF
		lda	<DPbyte_D2
		jsr	Display_Vect_BCD ; Display BCD numbers
		lda	<DPbyte_D3
		jsr	Display_Vect_BCD ; Display BCD numbers
		ldd	#$8040
		std	,y++

loc_FAC1:
		leax	4,x
		cmpx	#off_FAF9+$10
		lbcs	loc_FA42
		lds	#$4FFF
		tst	<DPbyte_CC
		bne	loc_FAD6
		ldb	#$C8 ; '»'
		bra	loc_FAD8
; ---------------------------------------------------------------------------

loc_FAD6:
		ldb	#$C7 ; '«'

loc_FAD8:				; Print	text string from pointer table
		jsr	sub_E7C7
		ldu	#off_F727
		jmp	sub_F70D
; End of function sub_FA4E

; ---------------------------------------------------------------------------
off_FAE1:	fdb sub_FBAA
		fdb $1F6A
		fdb sub_FBBF
		fdb $1F38
off_FAE9:	fdb sub_FCAC
		fdb $1F06
		fdb sub_FCAC
		fdb $1ED4
		fdb sub_FCAC
		fdb $1EA2
		fdb sub_FCAC
		fdb $1E70
off_FAF9:	fdb sub_FB09
		fdb $1F6A
		fdb sub_FC1C
		fdb $1F38
		fdb sub_FC72
		fdb $1F06
		fdb sub_FBD4
		fdb $1ED4

; =============== S U B	R O U T	I N E =======================================


sub_FB09:

; FUNCTION CHUNK AT FBF6 SIZE 00000026 BYTES

		lds	#sub_FB10
		jmp	loc_FBF6
; End of function sub_FB09


; =============== S U B	R O U T	I N E =======================================


sub_FB10:
		cmpd	#1
		beq	loc_FB19
		jmp	sub_FA4E
; ---------------------------------------------------------------------------

loc_FB19:
		ldu	#2

loc_FB1C:
		lds	#sub_FB23
		jmp	loc_FC0D
; End of function sub_FB10


; =============== S U B	R O U T	I N E =======================================


sub_FB23:
		cmpd	word_F34E,u
		beq	loc_FB2D
		jmp	sub_FA4E
; ---------------------------------------------------------------------------

loc_FB2D:
		leau	2,u
		cmpu	#$20 ; ' '
		bcs	loc_FB1C
		jmp	sub_FA4E
; End of function sub_FB23

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_FE7C

loc_FB38:
		ldd	,x
		std	DVDDH
		ldd	2,x
		std	DVSRH
		mul
		ldd	MW0
		cmpd	4,x
		jmp	,s
; END OF FUNCTION CHUNK	FOR sub_FE7C
; ---------------------------------------------------------------------------
word_FB4B:	fdb $4000, $4000, $4000, $C8, $5555, $4000, $5555, $96
		fdb $2AAA, $4000, $2AAA, $64, $2AAA, $2AAA, $4000, $32
		fdb $5555, $5555, $4000, 0
word_FB73:	fdb $6EE4

; =============== S U B	R O U T	I N E =======================================


sub_FB75:
		ldd	#$5555
		std	MReg0F		; Math zero constant
		lda	#$57 ; 'W'
		sta	MW0
		bra	word_FB73
; End of function sub_FB75


; =============== S U B	R O U T	I N E =======================================


sub_FB82:
		ldd	#$AAAA
		std	MReg0F		; Math zero constant
		lda	#$58 ; 'X'
		sta	MW0
		bra	word_FB73
; End of function sub_FB82


; =============== S U B	R O U T	I N E =======================================


sub_FB8F:
		ldd	#$5555
		std	MReg0F		; Math zero constant
		lda	#$59 ; 'Y'
		sta	MW0
		bra	word_FB73
; End of function sub_FB8F


; =============== S U B	R O U T	I N E =======================================


sub_FB9C:
		lda	#$5A ; 'Z'
		sta	MW0
		bra	word_FB73
; End of function sub_FB9C


; =============== S U B	R O U T	I N E =======================================


sub_FBA3:
		lda	#$5B ; '['
		sta	MW0
		bra	word_FB73
; End of function sub_FBA3


; =============== S U B	R O U T	I N E =======================================


sub_FBAA:
		ldd	#$5555
		std	MReg00		; Math result X
		lda	#$5C ; '\'
		sta	MW0
		nop
		ldd	MReg01		; Math result Y
		cmpd	#$5555
		bra	word_FB73
; End of function sub_FBAA


; =============== S U B	R O U T	I N E =======================================


sub_FBBF:
		ldd	#$AAAA
		std	MReg00		; Math result X
		lda	#$5C ; '\'
		sta	MW0
		nop
		ldd	MReg01		; Math result Y
		cmpd	#$AAAA
		bra	word_FB73
; End of function sub_FBBF


; =============== S U B	R O U T	I N E =======================================


sub_FBD4:
		ldd	#$2696
		std	MReg0C		; XT
		ldd	#$1B2C
		std	MReg0D		; YT
		ldd	#$4000
		std	MReg0E		; ZT
		lda	#$5D ; ']'
		sta	MW0
		mul
		ldd	MReg00		; Math result X
		cmpd	#$B6A
		jmp	word_FB73
; End of function sub_FBD4

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_FB09

loc_FBF6:
		lda	#$5A ; 'Z'
		sta	MW0
		ldd	#0
		std	MReg0D		; YT
		ldd	#$4000
		std	MReg0E		; ZT
		ldd	#1
		std	MReg0C		; XT

loc_FC0D:				; XT
		std	MReg0C
		lda	#$5E ; '^'
		sta	MW0
		mul
		ldd	MReg00		; Math result X
		jmp	word_FB73
; END OF FUNCTION CHUNK	FOR sub_FB09

; =============== S U B	R O U T	I N E =======================================


sub_FC1C:
		ldu	#$5028
		ldd	#5

loc_FC22:
		std	,u
		addd	#1
		leau	8,u
		cmpu	#$6000
		bcs	loc_FC22
		ldd	#0
		std	MReg0F		; Math zero constant
		ldd	#$4000
		std	MReg10		; Math 1.000 constant
		ldd	#4
		std	MW1		; Point	BIC to $5020 MReg10
		ldu	#8

loc_FC44:
		sta	WDCLR
		tfr	u, d
		lsra
		rorb

loc_FC4B:
		lda	#$5B ; '['
		sta	MW0		; Test routine $5B
		decb
		bne	loc_FC4B
		lda	#$5F ; '_'
		sta	MW0
		mul
		cmpu	MReg00		; Math result X
		beq	loc_FC62
		jmp	word_FB73
; ---------------------------------------------------------------------------

loc_FC62:
		tfr	u, d
		leau	d,u
		cmpu	#$200
		bcs	loc_FC44
		ldd	#0
		jmp	word_FB73
; End of function sub_FC1C


; =============== S U B	R O U T	I N E =======================================


sub_FC72:
		ldd	#$1B2C
		std	MReg0C		; XT
		ldd	#0
		std	MReg0D		; YT
		ldd	#$4000
		std	MReg0E		; ZT
		lda	#$5D ; ']'
		sta	MW0
		mul
		ldd	#$196A
		std	MReg0C		; XT
		ldd	#0
		std	MReg0D		; YT
		ldd	#$4000
		std	MReg0E		; ZT
		lda	#$5E ; '^'
		sta	MW0
		mul
		ldd	MReg00		; Math result X
		cmpd	#$3496
		jmp	word_FB73
; End of function sub_FC72


; =============== S U B	R O U T	I N E =======================================


sub_FCAC:
		aslb
		aslb
		ldu	#word_FCD1
		leau	b,u
		ldd	,u
		std	MReg0C		; XT
		ldd	2,u
		std	MReg0D		; YT
		ldd	4,u
		std	MReg0E		; ZT
		lda	#$5D ; ']'
		sta	MW0
		mul
		ldd	MReg00		; Math result X
		cmpd	6,u
		jmp	word_FB73
; End of function sub_FCAC

; ---------------------------------------------------------------------------
word_FCD1:	fdb $5555, 0, $4000, $5555, 0, $5555, $C000, $5555
		fdb $2AAA, 0, $4000, $2AAA, 0, $2AAA, $C000, $2AAA
off_FCF1:	fdb sub_FB75, sub_FB82,	sub_FB8F, sub_FB9C, sub_FBA3, sub_FBAA,	sub_FBBF
off_FCFF:	fdb sub_FCAC, sub_FCAC,	sub_FCAC, sub_FCAC
; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_6532

Check_Test_Diag:
		lda	IO_Port_0
		anda	#$10
		ldb	IO_Port_1
		andb	#4
		cmpd	#0
		beq	loc_FD1A
		jmp	loc_F720
; ---------------------------------------------------------------------------

loc_FD1A:				; Self test and	Diag selected
		sta	WDCLR
		lda	#$FF
		sta	LED1
		sta	LED2
		sta	LED3
		ldb	OPT0		; Get diag test	option
		comb
		ldu	#Diag_Test_Table

loc_FD2F:
		cmpb	,u+
		bne	loc_FD5A
		sta	EVGRESET
		ldy	#0		; Point	to Vector RAM start instruction
		ldd	#$BFAE		; Vector instruction JRSL 0x1FAE
		std	,y++
		ldd	#$8040		; Vector instruction CNTR 0x40
		std	,y++
		lda	,u		; Get BCD number of diag test from table
		lds	#$4FFF		; Reset	stack pointer
		jsr	Display_Vect_BCD ; Display 2 digit BCD number in A
		ldd	#$2020		; Vector HALT
		std	,y++
		std	,y++
		sta	EVGGO
		ldu	#sub_FDBC	; Bounds check

loc_FD5A:
		leau	1,u
		cmpu	#sub_FDBC
		bcs	loc_FD2F
		ldb	OPT0
		comb
		tfr	b, a
		andb	#$F
		anda	#$F8 ; '¯'
		cmpa	#$C0 ; '¿'
		beq	loc_FD72
		clr	<DPbyte_D1

loc_FD72:
		ldx	#JMPTBL_Diag

loc_FD75:
		cmpa	,x+
		bne	loc_FD7B
		jmp	[,x]
; ---------------------------------------------------------------------------

loc_FD7B:
		leax	2,x
		cmpx	#Diag_Test_Table ; Bounds check
		bcs	loc_FD75
		jmp	loc_FF24
; END OF FUNCTION CHUNK	FOR sub_6532
; ---------------------------------------------------------------------------
JMPTBL_Diag:	fcb   0
		fdb sub_FDBC
		fcb $80	; Ä
		fdb sub_FDD7
		fcb $C0	; ¿
		fdb sub_FDF2
		fcb $E0	; ‡
		fdb sub_FE4F
		fcb $E8	; Ë
		fdb sub_FE4F
		fcb $F0	; 
		fdb sub_FE7C
		fcb $F8	; ¯
		fdb sub_FEA7
Diag_Test_Table:fcb $E0, $10, $E1, $11,	$E2, $12, $E3, $13
		fcb $E4, $14, $E5, $15,	$E6, $16, $E7, $17
		fcb $E8, $18, $E9, $19,	$EA, $20, $F0, $21
		fcb $F1, $22, $F2, $23,	$F3, $24, $F4, $25
		fcb $F8, $26

; =============== S U B	R O U T	I N E =======================================


sub_FDBC:
		tstb
		beq	loc_FDC2
		jmp	loc_FF24
; ---------------------------------------------------------------------------

loc_FDC2:
		tfr	s, d
		anda	#$40 ; '@'
		andb	#1
		cmpd	#0
		bne	loc_FDD4
		ldu	#LED1
		jmp	loc_FEFF
; ---------------------------------------------------------------------------

loc_FDD4:
		jmp	Check_Test_Diag
; End of function sub_FDBC


; =============== S U B	R O U T	I N E =======================================


sub_FDD7:
		tstb
		beq	loc_FDDD
		jmp	loc_FF24
; ---------------------------------------------------------------------------

loc_FDDD:
		tfr	s, d
		anda	#$81 ; 'Å'
		andb	#$F8 ; '¯'
		cmpd	#0
		bne	loc_FDEF
		ldu	#LED2
		jmp	loc_FEFF
; ---------------------------------------------------------------------------

loc_FDEF:
		jmp	Check_Test_Diag
; End of function sub_FDD7


; =============== S U B	R O U T	I N E =======================================


sub_FDF2:
		cmpb	#6
		bne	loc_FE0E
		tst	<DPbyte_D1
		bne	loc_FE0C
		ldx	#$800
		lda	#0

loc_FDFF:
		sta	,x+
		adda	#5
		cmpx	#$1000
		bcs	loc_FDFF
		lda	#$FF
		sta	<DPbyte_D1

loc_FE0C:
		bra	loc_FE34
; ---------------------------------------------------------------------------

loc_FE0E:
		clr	<DPbyte_D1
		sta	EVGRESET
		ldx	#Diag_Vect_Data	; Point	to diag	vector test instructions
		aslb
		aslb
		abx
		cmpx	#$FE4F
		bcs	loc_FE21
		jmp	loc_FF24
; ---------------------------------------------------------------------------

loc_FE21:
		ldd	,x
		std	>$0000
		ldd	2,x
		std	>$0002
		ldd	#$2020
		std	>$0004
		sta	EVGGO		; Run diag vector test

loc_FE34:
		jmp	Check_Test_Diag
; End of function sub_FDF2

; ---------------------------------------------------------------------------
Diag_Vect_Data:	fdb $2020, $2020, $100,	$100, $5010, $2020, $8040, $2020 ; Diagnostic vector test instruction data. Copied to VECT RAM for test
		fdb $7240, $2020, $6780, $2020

; =============== S U B	R O U T	I N E =======================================


sub_FE4F:
		ldx	#off_FCF1
		aslb
		abx
		ldy	#0

loc_FE58:
		cmpx	#Check_Test_Diag
		bcs	loc_FE60
		jmp	loc_FF24
; ---------------------------------------------------------------------------

loc_FE60:
		sta	WDCLR
		leay	1,y
		cmpy	#$200
		bcs	loc_FE71
		lds	#Check_Test_Diag
		bra	loc_FE75
; ---------------------------------------------------------------------------

loc_FE71:
		lds	#loc_FE58

loc_FE75:
		tfr	x, d
		subd	#off_FCFF
		jmp	[,x]
; End of function sub_FE4F


; =============== S U B	R O U T	I N E =======================================


sub_FE7C:

; FUNCTION CHUNK AT FB38 SIZE 00000013 BYTES

		ldx	#word_FB4B
		aslb
		aslb
		aslb
		abx
		ldy	#0

loc_FE87:
		cmpx	#word_FB73
		bcs	loc_FE8F
		jmp	loc_FF24
; ---------------------------------------------------------------------------

loc_FE8F:
		sta	WDCLR
		leay	1,y
		cmpy	#$200
		bcs	loc_FEA0

loc_FE9A:
		lds	#Check_Test_Diag
		bra	loc_FEA4
; ---------------------------------------------------------------------------

loc_FEA0:
		lds	#loc_FE87

loc_FEA4:
		jmp	loc_FB38
; End of function sub_FE7C


; =============== S U B	R O U T	I N E =======================================


sub_FEA7:
		andb	#7
		beq	loc_FEAE
		jmp	loc_FF24
; ---------------------------------------------------------------------------

loc_FEAE:
		lda	#1

loc_FEB0:
		stb	SOUNDRST
		tfr	x, u
		ldb	SOUNDIO
		ldb	SOUNDIO+1
		andb	#$40 ; '@'
		bne	loc_FF03
		ldb	#$80 ; 'Ä'

loc_FEC1:
		decb
		bmi	loc_FF03
		sta	WDCLR
		tst	SOUNDIO+1
		bmi	loc_FEC1
		sta	SOUNDIO
		ldb	SOUNDIO+1
		bpl	loc_FF03
		ldx	#$100

loc_FED7:
		leax	-1,x
		beq	loc_FF03
		sta	WDCLR
		ldb	SOUNDIO+1
		andb	#$40 ; '@'
		beq	loc_FED7
		tst	SOUNDIO+1
		bmi	loc_FF03
		cmpa	SOUNDIO
		bne	loc_FF03
		ldb	SOUNDIO+1
		andb	#$40 ; '@'
		bmi	loc_FF03
		asla
		bcc	loc_FEB0
		ldu	#$4682
		jmp	*+3

loc_FEFF:
		lda	#0
		sta	,u

loc_FF03:
		ldx	#0

loc_FF06:
		sta	WDCLR
		leax	1,x
		cmpx	#$AC55
		bcs	loc_FF06
		lda	#$FF
		sta	,u
		ldx	#0

loc_FF17:
		sta	WDCLR
		leax	1,x
		cmpx	#$AC55
		bcs	loc_FF17
		jmp	Check_Test_Diag
; End of function sub_FEA7

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR sub_6532

loc_FF24:
		lda	#0
		sta	LED1
		sta	LED2
		sta	LED3
		ldx	#0

loc_FF32:
		sta	WDCLR
		leax	1,x
		cmpx	#$5600
		bcs	loc_FF32
		lda	#$FF
		sta	LED1
		sta	LED2
		sta	LED3
		ldx	#0

loc_FF4A:
		sta	WDCLR
		leax	1,x
		cmpx	#$5600
		bcs	loc_FF4A
		jmp	Check_Test_Diag
; END OF FUNCTION CHUNK	FOR sub_6532
; ---------------------------------------------------------------------------
		fcb $A6, $BF, $C8, $40,	$96, $1F, $64, $10
		fcb $59, $A0, $74, $A6,	$20, $7B, $6E, $E0
		fcb $7D, $E8, $AE, $CD,	$78, $92, 7, $F4
		fcb 0, $18, $E9, $40, $9A, $F5,	$B0, $38
		fcb 7, $FF, $FF, $FF, $FF, $FF,	$FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF
aCopyright1983A:fcc "COPYRIGHT 1983 ATARI"
		fdb $C85
		fdb BADIRQ
		fdb BADIRQ
		fdb BADIRQ
		fdb IRQ
		fdb BADIRQ
		fdb BADIRQ
		fdb Reset
; end of 'ROM'


		end
