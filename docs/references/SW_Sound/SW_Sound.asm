
;	Working source assembler for Star Wars sound board. Dis-assembled form original binaries 136021.107 and 136021.208


;	 Sound interrupt timer from 6532 is 4mS

;	Sound FX use 2 POKEYs for total of 8 channels. Uses POKEY CI/O 3 and CI/O 2 which are at PCB locations 2D and 3D respectively
;	Sound FX work from a pair of tables of 4 byte command data, one pair of tables for each POKEY channel 
;	First table is for frequency, second table is for volume/distortion. This creates a frequency and volume envelope in timed steps
;	Volume tables seem to control when FX end point is, by last single data byte being 0
;	A sound data table starts with a byte that has a bit set for each channel to be used, then following that byte is a pair of 16 bit pointers 
;	to the frequency and volume/distortion tables, one pair of pointers for each channel that is flagged in use
;
;	e.g. for 'Fire lasers' sound:
; byte_7354:      fcb $C0			Uses first 2 channels from
;                 fdb stru_6B46		Channel 1 frequency list
;                 fdb stru_6B4E		Channel 1 vol/dist list
;                 fdb stru_6B6B		Channel 2 frequency list
;                 fdb stru_6B73		Channel 2 vol/dist list



;
;	4 bytes in table represent:
;	Byte 0 = Timer count for each change (addition) to freq/volume
;	Byte 1 = Timer count for unchanging freq/volume (repeat last data)
;	Byte 2 = Frequency or volume/distortion data
;	Byte 3 = Addition/subtraction value to change freq or volume
;
;	When changing and no change timers have expired, increment table pointer to next 4 bytes of data
;	
;



;	Music uses 2 POKEYs but with 2 16 bit channels each, for a total of 4 16 bit music voices.
;	Uses POKEY CI/O 1 and CI/O 0 which are at PCB locations 4D and 5D respectively
;
;
;
;
;
;
;
;
;
;
; ---------------------------------------------------------------------------

;ptrRAM_Music	struc ;	(sizeof=0x8)
;ptrRAM:		fdb ?
;field1:		fcb ?
;POKEYReg1:	fdb ?
;field4:		fcb ?
;POKEYReg2:	fdb ?
;ptrRAM_Music	ends

; ---------------------------------------------------------------------------

;strMusicRAM	struc ;	(sizeof=0x19)
;field_0:	fcb ?
;field_1:	fcb ?
;ptrMusicData1:	fdb ?
;WORD_4:		fdb ?
;field_6:	fcb ?
;field_7:	fcb ?
;field_8:	fcb ?
;field_9:	fcb ?
;field_A:	fcb ?
;field_B:	fcb ?
;field_C:	fcb ?
;field_D:	fcb ?
;field_E:	fcb ?
;field_F:	fcb ?
;field_10:	fcb ?
;field_11:	fcb ?
;WORD_12:	fdb ?
;WORD_14:	fdb ?
;field_16:	fcb ?
;WORD_17:	fdb ?
;strMusicRAM	ends

; ---------------------------------------------------------------------------

;sndFX_RAM       struc ; (sizeof=0xA)
;ptrFXFr:        fdb ?
;FNoChTmr:       fcb ?
;FChTmr:         fcb ?
;Freq:           fcb ?
;ptrFXVl:        fdb ?
;VNoChTmr:       fcb ?
;VChTmr:         fcb ?
;Vol_Dist:       fcb ?
;sndFX_RAM       ends



; Processor:	    6809
; Target assembler: AS09 V1.42 http://www.kingswood-consulting.co.uk/assemblers/

; ===========================================================================

	struct	sndFX_Table
	db	ChTmr                  ; Timer count for each change (addition) to freq/volume
	db	NoChTmr                  ; Timer count for unchanging freq/volume (repeat last data)
	db	InitValu                ; Frequency or volume/distortion data
	db	AdderVal				; Addition/subtraction value to change freq or volume
	end	struct


;	8 bit port write back to main CPU

SOUT:	equ	$0000

;	8 bit port read from main CPU

SIN:	equ	$800



;	Direct page always at $1000 which is 6532 PIA RAM
;	Stack is from $107F down, so also in PIA RAM
;	PIA failure will therefore not allow sound board code to run

		org	$1000
		direct	$1000

DPbyte_0:	rmb 1
			rmb 8
DPbyte_9:		rmb 1
DPbyte_A:		rmb 1
DPbyte_B:		rmb 1

DPbyte_C:		rmb 1  
				   
DPbyte_D:		rmb 1  
				   
DPbyte_E:		rmb 1

word_100F:	rmb 1  
DPbyte_10:		rmb 1
DP_MusChFlg:		rmb 1
DPbyte_12:		rmb 1
ptr5220Speech_Data_Start:rmb 2
DPbyte_15:		rmb 1
DPbyte_16:		rmb 1
DPptr5220Speech_Data_End:rmb 2
DPbyte_19:		rmb 1
		rmb 1
DPbyte_1B:		rmb 1
		rmb 1
DPbyte_1D:		rmb 1
DPbyte_1E:		rmb 1
DPbyte_1F:		rmb 1
DPbyte_20:		rmb $60

DPbyte_80:		rmb 1
DPbyte_81:		rmb 1
DPbyte_82:		rmb 1
DPbyte_83:		rmb 1
		rmb 1
DPbyte_85:		rmb 1
		rmb 1
DPbyte_87:		rmb $18
DPbyte_9F:		rmb 1


	org	$2020

Command_Buffer:	rmb	1

		org $2100

POKEY_Regs_Used:	rmb 1	  
		;strct_sndFX1:	sndFX_RAM <?>
strct_sndFX1:	rmb	$0A
					; Sound	FX buffer
;		sndFX_RAM <?>
		rmb	$0A
;		sndFX_RAM <?>
		rmb	$0A
;		sndFX_RAM <?>
		rmb	$0A

		rmb 1
		rmb 1
		rmb 1
		rmb 1
		rmb 1
word_212E:	rmb 2

		org	$2200

;		strMusicRAM <?>
		rmb	$19
;		strMusicRAM <?>
		rmb	$19
;		strMusicRAM <?>
		rmb	$19
;		strMusicRAM <?>
		rmb	$19
;		strMusicRAM <?>
		rmb	$19
		rmb	$19
;		strMusicRAM <?>
		rmb	$19
;		strMusicRAM <?>
		rmb	$19
;		strMusicRAM <?>
		rmb	$19

		org	$2300

Sound_State_1:	rmb	1


; ===========================================================================

		org $4000


		fdb $BEE4		; Checksum?

SpchTab:
		fdb spDat001, spDat002 - 2 		; Use the force Luke
		fdb spDat001, spDat002 - 2 		; Use the force Luke
		fdb spDat002, spDat003 - 2		; Remember
		fdb spDat003, spDat004 - 2		; I'm on the leader
		fdb spDat004, spDat005 - 2		; The force is strong in this one
		fdb spDat005, spDat006 - 2		; Red five standing by
		fdb spDat006, spDat007 - 2		; Red five I'm going in
		fdb spDat007, spDat008 - 2		; R2 try and increase the power
		fdb spDat008, spDat009 - 2		; You're all clear kid
		fdb spDat009, spDat010 - 2		; Let go Luke
		fdb spDat010, spDat011 - 2		; <Vader breathing>
		fdb spDat011, spDat012 - 2		; Yahoo!
		fdb spDat012, spDat013 - 2		; I have you now
		fdb spDat013, spDat014 - 2		; Look at the size of that thing
		fdb spDat014, spDat015 - 2		; Stay in attack formation
		fdb spDat015, spDat016 - 2		; The force will be with you
		fdb spDat016, spDat017 - 2		; Always
		fdb spDat017, spDat018 - 2		; <R2 scream>
		fdb spDat018, spDat019 - 2		; <Tie fighter>
		fdb spDat019, spDat020 - 2		; I'm hit but not bad, R2 see what you can do with it
		fdb spDat020, spDat021 - 2		; I've lost R2
		fdb spDat021, spDat022 - 2		; Great shot kid that was one in a million
		fdb spDat022, spDat023 - 2		; I can't shsake him
		fdb spDat023, spData_End - 2	; Luke trust me



	include	"Sound\Speech1.asm"
	include	"Sound\Speech2.asm"
	include	"Sound\Speech3.asm"
	include	"Sound\Speech4.asm"
	include	"Sound\Speech5.asm"
	include	"Sound\Speech6.asm"
	include	"Sound\Speech7.asm"
	include	"Sound\Speech8.asm"
	include	"Sound\Speech9.asm"
	include	"Sound\Speech10.asm"
	include	"Sound\Speech11.asm"
	include	"Sound\Speech12.asm"
	include	"Sound\Speech13.asm"
	include	"Sound\Speech14.asm"
	include	"Sound\Speech15.asm"
	include	"Sound\Speech16.asm"
	include	"Sound\Speech17.asm"
	include	"Sound\Speech18.asm"
	include	"Sound\Speech19.asm"
	include	"Sound\Speech20.asm"
	include	"Sound\Speech21.asm"
	include	"Sound\Speech22.asm"
	include	"Sound\Speech23.asm"

spData_End:


	include	"Sound\Music_Tables.asm"
	include	"Sound\FX_Tables.asm"
	include	"Sound\FX_Functions.asm"

; ---------------------------------------------------------------------------
		fdb byte_72D1		; Doesn't seem to be read?
		fdb byte_72D6
		fdb byte_72DB
		fdb byte_72E4
		fdb byte_72ED
		fdb byte_72F6
		fdb byte_72FF
		fdb byte_7304
		fdb byte_7309
		fdb byte_730E
		fdb byte_732F
		fdb byte_733C
		fdb byte_7341
		fdb byte_7346
		fdb byte_734F
		fdb byte_7354
		fdb byte_735D
		fdb byte_736E
		fdb byte_7373
 		fdb byte_737C
		fdb byte_7385
		fdb byte_738A
		fdb byte_738F

; =============== S U B	R O U T	I N E =======================================

	include	"Sound\Music_Functions.asm"
	include	"Sound\Speech_Functions.asm"


; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR Check_Sound_Command

		; public Reset_Vector
Reset_Vector:
		jmp	Reset_Main

; ---------------------------------------------------------------------------

Rst_loc_7D47:
		andcc	#$EF ; 'ï'
		ldx	#$14D


Rst_loc_7D4C:
		lda	<DPbyte_0
		cmpa	#$3F ; '?'
		bne	Reset_Vector


Check_DP_Sanity:
		tfr	dp, a
		cmpa	#$10
		bne	Reset_Vector


WDog_Count:
		leax	-1,x
		beq	Reset_Vector


Check_4mS_Flag:
		lsr	<DPbyte_B
		bcc	Rst_loc_7D4C


Process_4mS:
		lda	#$5A ; 'Z'
		sta	>SOUT
		inc	<DPbyte_A
		bne	loc_7D95

		inc	<DPbyte_9
		lda	#3
		ldb	<DPbyte_E
		cmpb	#3
		bcs	Rst_loc_7D75

		lda	#1


Rst_loc_7D75:
		anda	<DPbyte_9
		bne	loc_7D95

		clr	word_100F
		lda	<DPbyte_80
		anda	#$10
		bne	loc_7D95	; Check	DIAG state

		inc	word_100F
		incb
		cmpb	#$3C ; '<'
		bcs	loc_7D8C	; Loop from 0x01 to 0x3C

		ldb	#1


loc_7D8C:
		stb	<DPbyte_E
		ldx	#off_7F61
		abx
		abx
		jsr	[,x]


loc_7D95:
		jsr	Speech_Function_1

		jsr	Check_Sound_Command

		ldb	<DPbyte_80
		lda	<DPbyte_15
		ora	<DPbyte_20
		bne	loc_7DBE

		lda	<DP_MusChFlg
		bne	loc_7DBE

		lda	word_100F
		beq	loc_7DB2

		lda	<DPbyte_E
		cmpa	#3
		bls	loc_7DBE


loc_7DB2:
		ldx	word_212E
		cmpx	#stru_6D08
		bcc	loc_7DBE

		andb	#$F7 ; '÷'
		bra	loc_7DC0

; ---------------------------------------------------------------------------

loc_7DBE:
		orb	#8


loc_7DC0:
		stb	<DPbyte_80
		lda	<DPbyte_A
		lsra
		bcs	loc_7DCA

		jsr	Sound_FX_1


loc_7DCA:
		jsr	Music_Sub2

		jsr	Speech_Function_1

		jmp	Rst_loc_7D47

; END OF FUNCTION CHUNK	FOR Check_Sound_Command

; =============== S U B	R O U T	I N E =======================================


		; public Check_Sound_Command
Check_Sound_Command:
		ldb	<DPbyte_D
		cmpb	<DPbyte_C
		beq	locret_7DF2

		incb
		andb	#$1F
		stb	<DPbyte_D
		ldx	#Command_Buffer
		ldb	b,x
		lbeq	Reset_Main

		cmpb	#$3C ; '<'
		bhi	locret_7DF2

		ldx	#off_7F61
		abx
		abx
		jsr	[,x]		; Jump to command function for sound/speech


locret_7DF2:
		rts

; End of function Check_Sound_Command


; =============== S U B	R O U T	I N E =======================================


		; public IRQ_Func
IRQ_Func:

; FUNCTION CHUNK AT 7D44 SIZE 0000008F BYTES
; FUNCTION CHUNK AT 7E27 SIZE 0000009A BYTES
; FUNCTION CHUNK AT 7ED1 SIZE 00000090 BYTES

		ldb	<DPbyte_C
		ldx	#Command_Buffer	; Point	to buffer for Main CPU data commands
		lda	<DPbyte_80	; Read PIA Port	A
		bpl	loc_7E06	; Check	MAINFLAG

		lda	SIN		; Read data from Main CPU
		beq	Reset_Main

		incb
		andb	#$1F
		sta	b,x		; Store	Main CPU command data


loc_7E06:				; Read PIA timer interrupt flag
		lda	<DPbyte_85
		bpl	loc_7E12


Timer_Interrupt:			; Set 6532 PIA Timer for count of 6 at /1024 = 4.096mS interrupt
		lda	#6
		sta	<DPbyte_9F
		inc	<DPbyte_B	; Increment 4mS	count @	0x100B
		bvs	Reset_Main	; Reset	if count is 127


loc_7E12:				; Read PIA Port	A
		lda	<DPbyte_80
		bpl	loc_7E24	; If Main CPU interrupt	flag set then

		lda	<DPbyte_85	; Read PIA interrupt flag
		lda	SIN		; Read data from Main CPU
		beq	Reset_Main	; We don't like zero as a data byte!

		incb
		andb	#$1F
		sta	b,x
		bra	loc_7E12

; ---------------------------------------------------------------------------

loc_7E24:				; Store	number of command bytes	read
		stb	<DPbyte_C
		rti

; End of function IRQ_Func

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR IRQ_Func

		; public Reset_Main
Reset_Main:
		orcc	#$10
		lda	SIN		; Clear	SIN IRQ	flag
		lds	#$107F
		lda	#$10
		tfr	a, dp
		lda	#$FF
		sta	<DPbyte_83
		sta	<DPbyte_82
		sta	<DPbyte_80
		ldb	#$2B ; '+'
		stb	<DPbyte_81
		ldx	#$1800
		ldd	#0


loc_7E46:
		std	,x++
		cmpx	#$1820
		bcs	loc_7E46

		lda	SIN
		sta	>SOUT
		ldx	#$2000
		ldd	#0


loc_7E59:
		std	,x++
		cmpx	#$2800
		bcs	loc_7E59

		ldx	#$1000


loc_7E63:
		std	,x++
		cmpx	#$1080
		bcs	loc_7E63

		sta	$1827
		sta	$182F
		sta	$1837
		sta	$183F
		sta	$1820
		sta	$1828
		sta	$1830
		sta	$1838
		lda	#7		; Keep POKEYs out of test mode
		sta	$1827
		sta	$182F
		sta	$1837
		sta	$183F
		lda	<DPbyte_80
		anda	#$10
		bne	loc_7E9E


DIAG_Mode:
		lda	<DPbyte_80
		ora	#8
		sta	<DPbyte_80
		bra	loc_7ED1

; ---------------------------------------------------------------------------

loc_7E9E:
		lda	<DPbyte_80
		anda	#$F7 ; '÷'
		sta	<DPbyte_80
		lda	#$3F ; '?'
		sta	<DPbyte_0	; Direct page address 00
		jsr	Init_Music

		jsr	Spch_sub_7C45

		lda	<DPbyte_85
		lda	SIN
		lda	#$5A ; 'Z'
		sta	>SOUT
		lda	#6		; Set PIA timer	to 4.096mS interrupt
		sta	<DPbyte_9F
		sta	<DPbyte_87
		jmp	Rst_loc_7D47

; END OF FUNCTION CHUNK	FOR IRQ_Func
; ---------------------------------------------------------------------------
word_7EC1:	fdb $2000
		fdb $2800
		fcb 1
		fdb $1000
		fdb $1080
		fcb   2
word_7ECB:	fdb $4000
		fdb $6000
word_7ECF:	fdb $8000
; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR IRQ_Func

loc_7ED1:
		lda	#0
		ldu	#word_7EC1


loc_7ED6:
		ldx	,u
		leay	1,x


loc_7EDA:				; RAM test
		sty	,x++
		leay	$FF01,y
		cmpx	2,u
		bcs	loc_7EDA

		ldx	,u
		leay	1,x


loc_7EE9:
		cmpy	,x++
		beq	loc_7EF0

		ora	4,u


loc_7EF0:
		leay	$FF01,y
		cmpx	2,u
		bcs	loc_7EE9

		leau	5,u
		cmpu	#word_7ECB	; ROM test
		bcs	loc_7ED6

		tfr	d, y
		ldu	#word_7ECB


loc_7F05:
		ldx	,u++
		tfr	x, d


loc_7F09:
		addd	,x++
		cmpx	,u
		bcs	loc_7F09

		std	,x
		beq	loc_7F22

		tfr	y, d
		cmpx	#$6010
		bcc	loc_7F1E

		ora	#4
		bra	loc_7F20

; ---------------------------------------------------------------------------

loc_7F1E:
		ora	#8


loc_7F20:
		tfr	d, y


loc_7F22:
		cmpu	#word_7ECF
		bcs	loc_7F05

		tfr	y, d
		ldb	#3


loc_7F2C:
		lsra
		bcc	loc_7F37

		ldu	#$CFA8		; Test mode beeps
		stu	$1800
		bra	loc_7F3D

; ---------------------------------------------------------------------------

loc_7F37:
		ldu	#$20A8
		stu	$180A


loc_7F3D:
		ldx	#$8000


loc_7F40:
		leax	-1,x
		bne	loc_7F40

		ldu	#0
		stu	$1800
		stu	$180A
		ldx	#$8000
		tstb
		bne	loc_7F57

		leax	$7FFF,x


loc_7F57:
		leax	-1,x
		bne	loc_7F57

		decb
		bpl	loc_7F2C

		jmp	Reset_Vector

; END OF FUNCTION CHUNK	FOR IRQ_Func
; ---------------------------------------------------------------------------
off_7F61:	fdb Reset_Vector	; Sound/speech function	pointer	table
		fdb FX_loc_743C
		fdb Mus_sub_7686
		fdb Spch_loc_7BAB
		fdb Spch_loc_7C0D
		fdb Spch_loc_7BBA
		fdb Spch_loc_7BB3
		fdb Spch_loc_7C14
		fdb Spch_loc_7BC2
		fdb Spch_loc_7BDB
		fdb Spch_loc_7C1B
		fdb Spch_loc_7B7E
		fdb Spch_loc_7BFF
		fdb Spch_loc_7BE3
		fdb Spch_loc_7BD4
		fdb Spch_loc_7B6D
		fdb Spch_sub_7B65
		fdb Spch_loc_7BA3
		fdb Spch_loc_7BF1
		fdb Spch_loc_7C06
		fdb sub_7C40
		fdb Spch_loc_7BCB
		fdb Spch_loc_7B90
		fdb Spch_loc_7B76
		fdb Spch_loc_7BF8
		fdb Spch_loc_7B88
		fdb Spch_loc_7B9A
		fdb Mus_sub_753C
		fdb Mus_sub_755D
		fdb Mus_sub_7665
		fdb Mus_sub_7644
		fdb Mus_sub_757E
		fdb Mus_sub_7602
		fdb Mus_sub_759F
		fdb Mus_sub_75C0
		fdb Mus_sub_751B
		fdb Mus_sub_75E1
		fdb Mus_sub_7623
		fdb FX_loc_7401
		fdb FX_loc_73F5
		fdb FX_loc_740D
		fdb FX_loc_7435
		fdb FX_loc_73C5
		fdb FX_loc_73CB
		fdb FX_loc_73D7
		fdb FX_loc_7419
		fdb FX_loc_73FB
		fdb FX_loc_7407
		fdb FX_loc_73B7
		fdb FX_loc_7420
		fdb FX_sub_73B0
		fdb FX_loc_73D1
		fdb FX_loc_7413
		fdb FX_loc_73EF
		fdb FX_loc_73E3
		fdb FX_loc_73E9
		fdb FX_loc_7427
		fdb FX_loc_73DD
		fdb snd_Fire_Guns
		fdb FX_loc_742E
		fcb $FF
		fcb $FF
		fcb $FF
aCopyright1983A:fcc "COPYRIGHT 1983 ATARI"
		fdb $35E9



		org	$7FF2

		fdb Reset_Main
		fdb Reset_Main
		fdb Reset_Main
		fdb IRQ_Func
		fdb Reset_Main
		fdb Reset_Main
		fdb Reset_Vector
; end of 'ROM'


		end
