import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  NATIVE_MINT,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import {
  createATAWithoutCheckIx,
  getActivityIndex,
  getGatewayAuthority,
} from "../utils";
import {
  IReserveInfo,
  francium,
  IFarmInfo,
} from "@dappio-wonderland/navigator";
import {
  ActionType,
  GatewayParams,
  IProtocolFarm,
  IProtocolMoneyMarket,
} from "../builder";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { FRANCIUM_ADAPTER_PROGRAM_ID } from "../ids";
import { struct, u8 } from "@project-serum/borsh";

export class ProtocolFrancium implements IProtocolMoneyMarket, IProtocolFarm {
  constructor(
    private _connection: anchor.web3.Connection,
    private _gatewayProgram: anchor.Program<Gateway>,
    private _gatewayStateKey: anchor.web3.PublicKey,
    private _gatewayParams: GatewayParams
  ) {}

  async supply(
    reserveInfo: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.Transaction[]> {
    const reserve = reserveInfo as francium.ReserveInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let preTx = new anchor.web3.Transaction();
    const supplyTokenMint = reserve.tokenMint;
    const reserveTokenMint = reserve.shareMint;

    const supplyTokenAddress = await getAssociatedTokenAddress(
      supplyTokenMint,
      userKey
    );
    preTx.add(await createATAWithoutCheckIx(userKey, supplyTokenMint));

    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );
    preTx.add(await createATAWithoutCheckIx(userKey, reserveTokenMint));

    const indexSupply = this._gatewayParams.actionQueue.indexOf(
      ActionType.Supply
    );

    const moneyMarketSupplyAmount =
      this._gatewayParams.payloadQueue[indexSupply];

    if (supplyTokenMint.equals(NATIVE_MINT)) {
      preInstructions.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: supplyTokenAddress,
          lamports: moneyMarketSupplyAmount.toNumber(),
        })
      );
      preInstructions.push(createSyncNativeInstruction(supplyTokenAddress));
      postInstructions.push(
        createCloseAccountInstruction(supplyTokenAddress, userKey, userKey)
      );
    }
    preInstructions.push(this._refreshReservesIx(reserve));
    let remainingAccounts = [
      { pubkey: supplyTokenAddress, isSigner: false, isWritable: true }, //0
      { pubkey: reserveTokenAddress, isSigner: false, isWritable: true }, //1
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true }, //2
      { pubkey: reserve.tknAccount, isSigner: false, isWritable: true }, //3
      { pubkey: reserve.shareMint, isSigner: false, isWritable: true }, //4
      { pubkey: reserve.market, isSigner: false, isWritable: true }, //5
      { pubkey: francium.LENDING_AUTHORITY, isSigner: false, isWritable: true }, //6
      { pubkey: userKey, isSigner: true, isWritable: true }, //7
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      }, //8
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }, //9
    ];

    const supplyTx = await this._gatewayProgram.methods
      .supply()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: FRANCIUM_ADAPTER_PROGRAM_ID,
        baseProgramId: francium.FRANCIUM_LENDING_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();
    return [preTx, supplyTx];
  }

  async unsupply(
    reserveInfo: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.Transaction[]> {
    let preTx = new anchor.web3.Transaction();
    const reserve = reserveInfo as francium.ReserveInfo;

    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    const liquidityTokenMint = reserve.tokenMint;
    const reserveTokenMint = reserve.shareMint;

    const liquidityTokenAddress = await getAssociatedTokenAddress(
      liquidityTokenMint,
      userKey
    );
    preTx.add(await createATAWithoutCheckIx(userKey, liquidityTokenMint));

    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );
    preTx.add(await createATAWithoutCheckIx(userKey, reserveTokenMint));

    if (liquidityTokenMint.equals(NATIVE_MINT)) {
      postInstructions.push(
        createCloseAccountInstruction(liquidityTokenAddress, userKey, userKey)
      );
    }
    preInstructions.push(this._refreshReservesIx(reserve));
    let remainingAccounts = [
      { pubkey: reserveTokenAddress, isSigner: false, isWritable: true }, //0
      { pubkey: liquidityTokenAddress, isSigner: false, isWritable: true }, //1
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true }, //2
      { pubkey: reserve.shareMint, isSigner: false, isWritable: true }, //3
      { pubkey: reserve.tknAccount, isSigner: false, isWritable: true }, //4
      { pubkey: reserve.market, isSigner: false, isWritable: true }, //5
      { pubkey: francium.LENDING_AUTHORITY, isSigner: false, isWritable: true }, //6
      { pubkey: userKey, isSigner: true, isWritable: true }, //7
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      }, //8
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }, //9
    ];

    const unsupplyTx = await this._gatewayProgram.methods
      .unsupply()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: FRANCIUM_ADAPTER_PROGRAM_ID,
        baseProgramId: francium.FRANCIUM_LENDING_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return [preTx, unsupplyTx];
  }

  async borrow(): Promise<anchor.web3.Transaction[]> {
    return [];
  }

  async repay(): Promise<anchor.web3.Transaction[]> {
    return [];
  }

  async stake(
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.Transaction[]> {
    const farm = farmInfo as francium.FarmInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    const reserveTokenMint = farm.stakedTokenMint;

    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, reserveTokenMint)
    );

    if (!(await francium.checkFarmerCreated(userKey, farm, this._connection))) {
      preInstructions.push(await this._initUserRewardIx(userKey, farm));
    }

    const rewardATA = await getAssociatedTokenAddress(
      farm.rewardsTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, farm.rewardsTokenMint)
    );
    const rewardBATA = await getAssociatedTokenAddress(
      farm.rewardsTokenMintB,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, farm.rewardsTokenMintB)
    );
    const userRewardPDA = await francium.infos.getFarmerId(farm, userKey);
    let remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true }, //0
      { pubkey: userRewardPDA, isSigner: false, isWritable: true }, //1
      { pubkey: reserveTokenAddress, isSigner: false, isWritable: true }, //2
      { pubkey: rewardATA, isSigner: false, isWritable: true }, //3
      { pubkey: rewardBATA, isSigner: false, isWritable: true }, //4
      {
        pubkey: farm.farmId,
        isSigner: false,
        isWritable: true,
      }, //5
      {
        pubkey: farm.poolAuthority,
        isSigner: false,
        isWritable: true,
      }, //6
      {
        pubkey: farm.stakedTokenAccount,
        isSigner: false,
        isWritable: true,
      }, //7
      {
        pubkey: farm.rewardsTokenAccount,
        isSigner: false,
        isWritable: true,
      }, //8
      {
        pubkey: farm.rewardsTokenAccountB,
        isSigner: false,
        isWritable: true,
      }, //9

      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }, //10
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      }, //11
    ];
    const stakeTx = await this._gatewayProgram.methods
      .stake()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: FRANCIUM_ADAPTER_PROGRAM_ID,
        baseProgramId: francium.FRANCIUM_LENDING_REWARD_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();
    return [stakeTx];
  }

  async unstake(
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.Transaction[]> {
    const farm = farmInfo as francium.FarmInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    const reserveTokenMint = farm.stakedTokenMint;

    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, reserveTokenMint)
    );

    const rewardATA = await getAssociatedTokenAddress(
      farm.rewardsTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, farm.rewardsTokenMint)
    );
    const rewardBATA = await getAssociatedTokenAddress(
      farm.rewardsTokenMintB,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, farm.rewardsTokenMintB)
    );
    const userRewardPDA = await francium.infos.getFarmerId(farm, userKey);
    let remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true }, //0
      { pubkey: userRewardPDA, isSigner: false, isWritable: true }, //1
      { pubkey: reserveTokenAddress, isSigner: false, isWritable: true }, //2
      { pubkey: rewardATA, isSigner: false, isWritable: true }, //3
      { pubkey: rewardBATA, isSigner: false, isWritable: true }, //4
      {
        pubkey: farm.farmId,
        isSigner: false,
        isWritable: true,
      }, //5
      {
        pubkey: farm.poolAuthority,
        isSigner: false,
        isWritable: true,
      }, //6
      {
        pubkey: farm.stakedTokenAccount,
        isSigner: false,
        isWritable: true,
      }, //7
      {
        pubkey: farm.rewardsTokenAccount,
        isSigner: false,
        isWritable: true,
      }, //8
      {
        pubkey: farm.rewardsTokenAccountB,
        isSigner: false,
        isWritable: true,
      }, //9
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }, //10
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      }, //11
    ];
    const unstakeTx = await this._gatewayProgram.methods
      .unstake()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: FRANCIUM_ADAPTER_PROGRAM_ID,
        baseProgramId: francium.FRANCIUM_LENDING_REWARD_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();
    return [unstakeTx];
  }

  async collateralize(): Promise<anchor.web3.Transaction[]> {
    return [];
  }

  async uncollateralize(): Promise<anchor.web3.Transaction[]> {
    return [];
  }

  async harvest(): Promise<anchor.web3.Transaction[]> {
    return [];
  }

  private async _initUserRewardIx(
    wallet: anchor.web3.PublicKey,
    rewardInfo: francium.FarmInfo
  ): Promise<anchor.web3.TransactionInstruction> {
    const dataLayout = struct([u8("instruction")]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({ instruction: 1 }, data);
    const stakeATA = await getAssociatedTokenAddress(
      rewardInfo.stakedTokenMint,
      wallet
    );
    const rewardATA = await getAssociatedTokenAddress(
      rewardInfo.rewardsTokenMint,
      wallet
    );
    const rewardBATA = await getAssociatedTokenAddress(
      rewardInfo.rewardsTokenMintB,
      wallet
    );
    const userRewardPDA = await francium.infos.getFarmerId(rewardInfo, wallet);
    const keys = [
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: userRewardPDA, isSigner: false, isWritable: true },
      { pubkey: rewardInfo.farmId, isSigner: false, isWritable: true },
      { pubkey: stakeATA, isSigner: false, isWritable: true },
      { pubkey: rewardATA, isSigner: false, isWritable: true },
      { pubkey: rewardBATA, isSigner: false, isWritable: true },
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];
    let initMinerIx = new anchor.web3.TransactionInstruction({
      keys,
      programId: francium.FRANCIUM_LENDING_REWARD_PROGRAM_ID,
      data,
    });
    return initMinerIx;
  }

  private _refreshReservesIx(
    reserveInfo: francium.ReserveInfo
  ): anchor.web3.TransactionInstruction {
    let refreshReservesData = Buffer.from("0c", "hex");
    let keys = [
      { pubkey: reserveInfo.market, isSigner: false, isWritable: true },
      { pubkey: reserveInfo.reserveId, isSigner: false, isWritable: true },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];
    let ix = new anchor.web3.TransactionInstruction({
      keys: keys,
      programId: francium.FRANCIUM_LENDING_PROGRAM_ID,
      data: refreshReservesData,
    });
    return ix;
  }
}